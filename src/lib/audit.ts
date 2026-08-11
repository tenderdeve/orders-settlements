import type { Types } from "mongoose";
import { AuditEvent } from "@/models/AuditEvent";
import { log } from "./log";
import type { OrderStatus } from "./status";

type AuditInput = {
  orderId: Types.ObjectId | string;
  userId: Types.ObjectId | string;
  type: "order.created" | "order.updated" | "order.deleted" | "payment.recorded";
  fromStatus?: OrderStatus | null;
  toStatus?: OrderStatus | null;
  data?: Record<string, unknown> | null;
};

/**
 * Never throws: a failed audit write must not fail a committed financial write.
 *
 * The financial state change is a single atomic document update and is never
 * partially applied; this event is written immediately afterwards and is
 * best-effort. That is acceptable because payments are embedded in the order, so
 * the order IS the payment ledger — every payment, amount, date and note survives
 * even if an audit write is lost. A production ledger would guarantee it with a
 * change stream on `orders`, or the transactional outbox pattern.
 */
export async function writeAudit(e: AuditInput) {
  try {
    await AuditEvent.create({
      ...e,
      fromStatus: e.fromStatus ?? null,
      toStatus: e.toStatus ?? null,
      data: e.data ?? null,
    });
  } catch (err) {
    log.error({
      evt: "audit.write_failed",
      orderId: String(e.orderId),
      type: e.type,
      err: String(err),
    });
  }
}
