import type { QueryFilter } from "mongoose";
import { todayUTC } from "./dates";

export const ORDER_STATUSES = ["pending", "partially_paid", "paid", "overdue"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Precedence (top wins):
 *   paid           — fully paid, regardless of due date
 *   overdue        — not fully paid AND due date is strictly in the past
 *   partially_paid — some payment, not yet due
 *   pending        — no payment, not yet due
 *
 * The due date is INCLUSIVE: an order due today is not overdue until tomorrow.
 */
export function deriveStatus(
  o: { totalCents: number; paidCents: number; dueDate: Date },
  today: Date = todayUTC(),
): OrderStatus {
  if (o.paidCents >= o.totalCents) return "paid";
  if (o.dueDate.getTime() < today.getTime()) return "overdue";
  if (o.paidCents > 0) return "partially_paid";
  return "pending";
}

/**
 * The same four rules as a MongoDB filter, so status filtering and pagination
 * run in the database. Field order matches index `user_status`.
 * MUST stay in lockstep with deriveStatus() — tests assert parity against real data.
 */
export function statusFilter(
  status: OrderStatus,
  today: Date = todayUTC(),
): QueryFilter<unknown> {
  switch (status) {
    case "paid":
      return { fullyPaid: true };
    case "overdue":
      return { fullyPaid: false, dueDate: { $lt: today } };
    case "partially_paid":
      return { fullyPaid: false, dueDate: { $gte: today }, hasPayments: true };
    case "pending":
      return { fullyPaid: false, dueDate: { $gte: today }, hasPayments: false };
  }
}

/** "partially_paid" -> "Partially paid" */
export const statusLabel = (s: OrderStatus) =>
  (s.charAt(0).toUpperCase() + s.slice(1)).replace(/_/g, " ");
