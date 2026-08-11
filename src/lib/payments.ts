import { Types } from "mongoose";
import { Order } from "@/models/Order";
import { writeAudit } from "./audit";
import { parseDateOnly, todayUTC } from "./dates";
import { db } from "./db";
import { ApiError } from "./http";
import { formatMoney } from "./money";
import { deriveStatus } from "./status";

/**
 * Back-dating is allowed and may pre-date the order — real payments get entered
 * late. Future-dating is not: it would let an order report as settled before the
 * money moved. Not expressible in Zod, because "today" is not a constant.
 */
export function resolvePaidOn(date?: string): Date {
  if (!date) return todayUTC();
  const paidOn = parseDateOnly(date);
  if (paidOn.getTime() > todayUTC().getTime()) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "The request body is invalid.",
      { fieldErrors: { date: ["Payments cannot be dated in the future."] } },
      "Use today's date or earlier.",
    );
  }
  return paidOn;
}

export async function recordPayment(
  userId: string,
  orderId: string,
  input: { amountCents: number; paidOn: Date; note?: string | null },
) {
  await db();
  const now = new Date();
  const amt = input.amountCents;

  // BSON is built by hand: aggregation-pipeline updates bypass Mongoose casting,
  // defaults and validators, so these must already be real BSON types.
  const payment = {
    _id: new Types.ObjectId(),
    amountCents: amt,
    paidOn: input.paidOn,
    note: input.note ?? null,
    createdAt: now,
  };

  // ── The whole concurrency answer. ────────────────────────────────────────
  // The over-payment guard lives in the FILTER, so MongoDB evaluates it
  // server-side at write time against the current document. There is no
  // read-then-write window: the document write lock makes match-and-update
  // one indivisible step. Two simultaneous $600 payments on a $1,000 order —
  // the first commits, the second's $expr no longer matches, so it updates
  // nothing and we return 422. No transaction, no row lock, no retry loop.
  const updated = await Order.findOneAndUpdate(
    {
      _id: orderId,
      userId,
      $expr: { $lte: [{ $add: ["$paidCents", amt] }, "$totalCents"] },
    },
    [
      {
        $set: {
          paidCents: { $add: ["$paidCents", amt] },
          balanceCents: { $subtract: ["$totalCents", { $add: ["$paidCents", amt] }] },
          fullyPaid: { $eq: [{ $add: ["$paidCents", amt] }, "$totalCents"] },
          hasPayments: true,
          payments: { $concatArrays: ["$payments", [payment]] },
          updatedAt: now,
        },
      },
    ],
    // Mongoose 9 requires opting in to array-form (aggregation pipeline) updates.
    { new: true, updatePipeline: true },
  ).lean();

  if (!updated) throw await rejection(userId, orderId, amt);

  // dueDate cannot change here, so the "before" status is the updated document
  // with the payment subtracted back out. Exact, and no extra read.
  await writeAudit({
    orderId,
    userId,
    type: "payment.recorded",
    fromStatus: deriveStatus({ ...updated, paidCents: updated.paidCents - amt }),
    toStatus: deriveStatus(updated),
    data: { paymentId: String(payment._id), amountCents: amt },
  });

  return { payment, order: updated };
}

/** Only runs on the failure path — one cheap read to say *why* the guard failed. */
async function rejection(userId: string, orderId: string, amt: number) {
  const o = await Order.findOne({ _id: orderId, userId }).select("totalCents paidCents").lean();
  if (!o) {
    return new ApiError(
      404,
      "NOT_FOUND",
      "Order not found.",
      undefined,
      "Check the order ID — you can only record payments on your own orders.",
    );
  }
  const remaining = o.totalCents - o.paidCents;
  return new ApiError(
    422,
    "OVERPAYMENT",
    remaining === 0
      ? "This order is already fully paid; no further payments can be recorded."
      : `Payment of ${formatMoney(amt)} exceeds the ${formatMoney(remaining)} still due on this order.`,
    { orderTotalCents: o.totalCents, paidCents: o.paidCents, maxAllowedCents: remaining },
    remaining === 0
      ? "Create a new order if you need to bill more."
      : `Enter ${formatMoney(remaining)} or less.`,
  );
}
