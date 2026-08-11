/**
 * Creates every index and collection validator, deliberately and idempotently.
 *
 * `autoIndex` is off (src/lib/db.ts): auto-indexing hides index design and issues
 * DDL on every cold start. Run this by hand — index changes are operations, not
 * build side effects.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { db } from "../src/lib/db";

type IndexSpec = {
  collection: string;
  name: string;
  keys: Record<string, 1 | -1>;
  options?: { unique?: boolean; expireAfterSeconds?: number };
  serves: string;
};

const INDEXES: IndexSpec[] = [
  // Equality on the owner, then sort — the index supplies the order, so no
  // in-memory sort. (ESR: Equality, Sort, Range.)
  { collection: "users", name: "email_unique", keys: { email: 1 }, options: { unique: true },
    serves: "login, signup — and IS the one-account-per-email constraint" },

  { collection: "orders", name: "user_recent", keys: { userId: 1, createdAt: -1 },
    serves: "default dashboard list" },

  // Two equality fields form the prefix, then one range field, then a trailing
  // in-index filter that needs no document fetch. Serves all four status filters;
  // `paid` is answered by the two-field prefix alone.
  { collection: "orders", name: "user_status",
    keys: { userId: 1, fullyPaid: 1, dueDate: 1, hasPayments: 1 },
    serves: "all four status filters" },

  // user_status cannot serve these: fullyPaid sits between userId and dueDate, so
  // dueDate cannot be a range bound while fullyPaid is unconstrained.
  { collection: "orders", name: "user_due", keys: { userId: 1, dueDate: 1 },
    serves: "due-date sort, CSV date-range export" },

  { collection: "orders", name: "user_customer", keys: { userId: 1, customerLower: 1 },
    serves: "anchored customer prefix search and customer sort" },

  { collection: "orders", name: "number_unique", keys: { number: 1 }, options: { unique: true },
    serves: "ORD-1042 reference lookup; guarantees the sequence never collides" },

  { collection: "auditevents", name: "order_recent", keys: { orderId: 1, createdAt: -1 },
    serves: "order Activity panel" },

  { collection: "auditevents", name: "user_recent", keys: { userId: 1, createdAt: -1 },
    serves: "account-wide activity" },

  // TTL indexes only work on a top-level date field — one reason idempotency keys
  // are their own collection rather than embedded.
  { collection: "idempotencykeys", name: "ttl_24h", keys: { createdAt: 1 },
    options: { expireAfterSeconds: 86_400 },
    serves: "self-cleaning dedupe store" },
];

/**
 * The invariants, enforced by the database itself. Mongoose validation only
 * protects writes that go through Mongoose; this protects the collection.
 */
const ordersValidator = {
  $expr: {
    $and: [
      { $gte: ["$totalCents", 1] },
      { $gte: ["$paidCents", 0] },
      { $lte: ["$paidCents", "$totalCents"] }, // I6 — no over-payment, ever
      { $eq: ["$balanceCents", { $subtract: ["$totalCents", "$paidCents"] }] }, // I5
      { $eq: ["$fullyPaid", { $eq: ["$paidCents", "$totalCents"] }] }, // I7
      { $eq: ["$hasPayments", { $gt: [{ $size: "$payments" }, 0] }] }, // I7
    ],
  },
};

/** createCollection if new, collMod if it already exists — makes migrate idempotent. */
async function ensureValidator(name: string, validator: object) {
  const conn = mongoose.connection.db!;
  const exists = await conn.listCollections({ name }).hasNext();
  const opts = { validator, validationLevel: "strict", validationAction: "error" } as const;
  if (exists) await conn.command({ collMod: name, ...opts });
  else await conn.createCollection(name, opts);
  console.log(`  validator  ${name}`);
}

async function ensureCollection(name: string) {
  const conn = mongoose.connection.db!;
  if (!(await conn.listCollections({ name }).hasNext())) await conn.createCollection(name);
}

async function main() {
  await db();
  const conn = mongoose.connection.db!;
  console.log(`migrating ${conn.databaseName}`);

  await ensureValidator("orders", ordersValidator);

  for (const c of ["users", "auditevents", "idempotencykeys", "counters"]) {
    await ensureCollection(c);
  }

  for (const ix of INDEXES) {
    await conn.collection(ix.collection).createIndex(ix.keys, { name: ix.name, ...ix.options });
    console.log(`  index      ${ix.collection}.${ix.name} — ${ix.serves}`);
  }

  console.log(`done: ${INDEXES.length} indexes, 1 collection validator`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
