/**
 * Eight demo orders that between them hit every status and every UI state,
 * including the three edge cases a reviewer should be able to *see*: an order
 * that is past due and partly paid, one that was overdue and is now settled, and
 * one due today that is therefore not yet overdue.
 *
 * Payments are written through recordPayment(), not raw inserts, so the seeded
 * data is produced by exactly the code path the application uses — including the
 * atomic guard and the audit trail.
 *
 * Idempotent: the demo user and everything they own is removed first.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { toDateOnly } from "../src/lib/dates";
import { db } from "../src/lib/db";
import { createOrder } from "../src/lib/orders";
import { recordPayment } from "../src/lib/payments";
import { AuditEvent } from "../src/models/AuditEvent";
import { Counter } from "../src/models/Counter";
import { Order } from "../src/models/Order";
import { User } from "../src/models/User";

const EMAIL = "demo@acme.io";
const PASSWORD = "password123";

/** n days from today, at UTC midnight, as "YYYY-MM-DD". */
function day(offset: number): string {
  const n = new Date();
  return toDateOnly(new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + offset)));
}

type Seed = {
  customer: string;
  due: number;
  lineItems: { description: string; quantity: number; unitPriceCents: number }[];
  payments?: { amountCents: number; on: number; note?: string }[];
  expect: string;
};

const SEEDS: Seed[] = [
  {
    customer: "Acme Corp",
    due: 7,
    lineItems: [{ description: "Consulting hours", quantity: 2, unitPriceCents: 50_000 }],
    expect: "pending",
  },
  {
    customer: "Globex",
    due: 14,
    lineItems: [
      { description: "Platform licence, annual", quantity: 1, unitPriceCents: 180_000 },
      { description: "Onboarding workshop", quantity: 2, unitPriceCents: 30_000 },
    ],
    payments: [{ amountCents: 240_000, on: -2, note: "Bank transfer GLX-4471" }],
    expect: "paid",
  },
  {
    customer: "Initech",
    due: -9,
    lineItems: [{ description: "Migration retainer", quantity: 1, unitPriceCents: 90_000 }],
    expect: "overdue",
  },
  {
    customer: "Umbrella",
    due: 21,
    lineItems: [
      { description: "Field engineering, days", quantity: 10, unitPriceCents: 25_000 },
      { description: "Compliance review", quantity: 1, unitPriceCents: 150_000 },
      { description: "Data migration", quantity: 1, unitPriceCents: 100_000 },
    ],
    payments: [
      { amountCents: 150_000, on: -12, note: "Deposit" },
      { amountCents: 50_000, on: -4 },
    ],
    expect: "partially_paid",
  },
  {
    // Past due AND partly paid: overdue wins, but the amount due still shows progress.
    customer: "Stark Industries",
    due: -3,
    lineItems: [{ description: "Reactor maintenance contract", quantity: 1, unitPriceCents: 1_200_000 }],
    payments: [{ amountCents: 400_000, on: -6, note: "Part payment pending PO" }],
    expect: "overdue",
  },
  {
    // Was overdue, now settled in full: paid beats overdue.
    customer: "Wayne Enterprises",
    due: -30,
    lineItems: [
      { description: "Security audit", quantity: 1, unitPriceCents: 50_000 },
      { description: "Follow-up report", quantity: 1, unitPriceCents: 25_000 },
    ],
    payments: [{ amountCents: 75_000, on: -5, note: "Settled late" }],
    expect: "paid",
  },
  {
    // Due today — inclusive, so not overdue until tomorrow.
    customer: "Soylent",
    due: 0,
    lineItems: [{ description: "Sample batch", quantity: 1, unitPriceCents: 9_999 }],
    expect: "pending",
  },
  {
    customer: "Hooli",
    due: 45,
    lineItems: [
      { description: "Engineering, days", quantity: 40, unitPriceCents: 25_000 },
      { description: "Architecture review", quantity: 1, unitPriceCents: 400_000 },
      { description: "Load testing", quantity: 1, unitPriceCents: 250_000 },
      { description: "Runbook and handover", quantity: 1, unitPriceCents: 120_000 },
      { description: "Support, months", quantity: 2, unitPriceCents: 17_500 },
    ],
    payments: [
      { amountCents: 500_000, on: -20, note: "Milestone 1" },
      { amountCents: 300_000, on: -10, note: "Milestone 2" },
      { amountCents: 250_000, on: -1, note: "Milestone 3" },
    ],
    expect: "partially_paid",
  },
];

async function main() {
  await db();

  const existing = await User.findOne({ email: EMAIL }).lean();
  if (existing) {
    await Promise.all([
      Order.deleteMany({ userId: existing._id }),
      AuditEvent.deleteMany({ userId: existing._id }),
      User.deleteOne({ _id: existing._id }),
    ]);
    console.log("removed the previous demo account and its orders");
  }

  const user = await User.create({ email: EMAIL, passwordHash: await bcrypt.hash(PASSWORD, 10) });
  const userId = String(user._id);

  // Start the sequence high so references read like real invoice numbers.
  await Counter.updateOne({ _id: "orderNumber" }, { $set: { seq: 1040 } }, { upsert: true });

  for (const s of SEEDS) {
    const order = await createOrder(userId, {
      customer: s.customer,
      dueDate: day(s.due),
      lineItems: s.lineItems,
    });
    for (const p of s.payments ?? []) {
      await recordPayment(userId, order.id, {
        amountCents: p.amountCents,
        paidOn: new Date(`${day(p.on)}T00:00:00.000Z`),
        note: p.note ?? null,
      });
    }
    const after = await Order.findById(order.id).select("number totalCents paidCents").lean();
    console.log(
      `  ORD-${after!.number}  ${s.customer.padEnd(18)} ` +
        `total ${String(after!.totalCents).padStart(8)}  paid ${String(after!.paidCents).padStart(8)}  ` +
        `expected ${s.expect}`,
    );
  }

  console.log(`\nseeded ${SEEDS.length} orders for ${EMAIL} / ${PASSWORD}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
