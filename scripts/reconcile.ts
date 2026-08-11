/**
 * Reconciliation: recompute every derived field from its source and assert they
 * agree. Exits non-zero on drift, so it can gate CI and would run on a schedule
 * in production.
 *
 * The denormalised fields (paidCents, balanceCents, fullyPaid, hasPayments) exist
 * so status filtering and pagination run in the database. This is what proves
 * they never lie — independently of the collection validator that also enforces it.
 */
import "dotenv/config";
import mongoose from "mongoose";
import { db } from "../src/lib/db";
import { Order } from "../src/models/Order";

type Drift = {
  _id: mongoose.Types.ObjectId;
  number: number;
  problems: string[];
  totalCents: number;
  expectedTotal: number;
  paidCents: number;
  expectedPaid: number;
};

async function main() {
  await db();

  const drift = await Order.aggregate<Drift>([
    {
      $addFields: {
        expectedTotal: { $sum: "$lineItems.amountCents" },
        expectedPaid: { $sum: "$payments.amountCents" },
        badLines: {
          $size: {
            $filter: {
              input: "$lineItems",
              as: "l",
              cond: {
                $ne: ["$$l.amountCents", { $multiply: ["$$l.quantity", "$$l.unitPriceCents"] }],
              },
            },
          },
        },
      },
    },
    {
      $addFields: {
        problems: {
          $concatArrays: [
            check({ $gt: ["$badLines", 0] }, "I2 lineItem.amountCents != quantity x unitPriceCents"),
            check({ $ne: ["$totalCents", "$expectedTotal"] }, "I3 totalCents != sum(lineItems)"),
            check({ $lt: ["$totalCents", 1] }, "I3 totalCents < 1"),
            check({ $ne: ["$paidCents", "$expectedPaid"] }, "I4 paidCents != sum(payments)"),
            check(
              { $ne: ["$balanceCents", { $subtract: ["$totalCents", "$paidCents"] }] },
              "I5 balanceCents != totalCents - paidCents",
            ),
            check({ $gt: ["$paidCents", "$totalCents"] }, "I6 paidCents > totalCents"),
            check(
              { $ne: ["$fullyPaid", { $eq: ["$paidCents", "$totalCents"] }] },
              "I7 fullyPaid disagrees with the amounts",
            ),
            check(
              { $ne: ["$hasPayments", { $gt: [{ $size: "$payments" }, 0] }] },
              "I7 hasPayments disagrees with payments[]",
            ),
            check({ $ne: ["$customerLower", { $toLower: "$customer" }] }, "customerLower is stale"),
          ],
        },
      },
    },
    { $match: { $expr: { $gt: [{ $size: "$problems" }, 0] } } },
    {
      $project: {
        number: 1,
        problems: 1,
        totalCents: 1,
        expectedTotal: 1,
        paidCents: 1,
        expectedPaid: 1,
      },
    },
  ]);

  // The unique index makes this impossible; asserting it is what turns "impossible"
  // into "verified".
  const duplicates = await Order.aggregate<{ _id: number; count: number }>([
    { $group: { _id: "$number", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  const total = await Order.countDocuments();
  console.log(`reconciled ${total} orders`);

  if (!drift.length && !duplicates.length) {
    console.log("no drift: every derived field agrees with its source");
    await mongoose.disconnect();
    return;
  }

  for (const d of drift) {
    console.error(`\nORD-${d.number} (${d._id})`);
    console.error(`  totalCents ${d.totalCents} vs expected ${d.expectedTotal}`);
    console.error(`  paidCents  ${d.paidCents} vs expected ${d.expectedPaid}`);
    for (const p of d.problems) console.error(`  - ${p}`);
  }
  for (const d of duplicates) {
    console.error(`\nduplicate order number ${d._id} used ${d.count} times`);
  }
  console.error(`\nFAILED: ${drift.length + duplicates.length} order(s) inconsistent`);
  await mongoose.disconnect();
  process.exit(1);
}

/** Emits a one-element array when the condition holds, so results concatenate. */
function check(cond: Record<string, unknown>, label: string) {
  return { $cond: [cond, [label], []] };
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
