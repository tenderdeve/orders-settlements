import mongoose, { Types } from "mongoose";
import { AuditEvent } from "@/models/AuditEvent";
import { nextOrderNumber } from "@/models/Counter";
import { Order } from "@/models/Order";
import { writeAudit } from "./audit";
import { db } from "./db";
import { parseDateOnly, toDateOnly, todayUTC } from "./dates";
import { ApiError } from "./http";
import { deriveStatus, statusFilter, type OrderStatus } from "./status";
import type {
  CreateOrderInput,
  ExportQuery,
  ListOrdersQuery,
  UpdateOrderInput,
} from "./validation";

// ── DTOs ────────────────────────────────────────────────────────────────────
// status is computed at serialisation time and never stored; dates cross the
// wire as "YYYY-MM-DD"; no Date and no ObjectId reaches the client.

export type OrderSummaryDTO = {
  id: string;
  number: number;
  reference: string;
  customer: string;
  dueDate: string;
  status: OrderStatus;
  subtotalCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  lineItemCount: number;
  paymentCount: number;
  createdAt: string;
  updatedAt: string;
};

export type LineItemDTO = {
  id: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
};

export type PaymentDTO = {
  id: string;
  orderId: string;
  amountCents: number;
  date: string;
  note: string | null;
  createdAt: string;
};

export type ActivityDTO = {
  id: string;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  data: Record<string, unknown> | null;
  createdAt: string;
};

export type OrderDTO = OrderSummaryDTO & {
  lineItems: LineItemDTO[];
  payments: PaymentDTO[];
  activity?: ActivityDTO[];
};

export type OrderListResult = {
  data: OrderSummaryDTO[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: {
    count: number;
    totalCents: number;
    paidCents: number;
    balanceCents: number;
    byStatus: Record<OrderStatus, number>;
  };
};

// ── Shared guards ───────────────────────────────────────────────────────────

/** Without this a malformed id becomes a Mongoose CastError and a 500. */
function assertObjectId(id: string) {
  if (!mongoose.isValidObjectId(id)) {
    throw new ApiError(404, "NOT_FOUND", "Order not found.", undefined, "Check the order ID.");
  }
}

const notFound = () =>
  new ApiError(
    404,
    "NOT_FOUND",
    "Order not found.",
    undefined,
    "Check the order ID — you can only work with your own orders.",
  );

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Server-side line-item maths: the client never gets to state an amount. */
function priceLineItems(lineItems: CreateOrderInput["lineItems"]) {
  const priced = lineItems.map((l) => ({
    description: l.description,
    quantity: l.quantity,
    unitPriceCents: l.unitPriceCents,
    amountCents: l.quantity * l.unitPriceCents,
  }));
  return { lineItems: priced, totalCents: priced.reduce((s, l) => s + l.amountCents, 0) };
}

// ── Mappers ─────────────────────────────────────────────────────────────────

type RawOrder = {
  _id: Types.ObjectId;
  number: number;
  customer: string;
  dueDate: Date;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  createdAt: Date;
  updatedAt: Date;
};

function baseDTO(o: RawOrder, lineItemCount: number, paymentCount: number): OrderSummaryDTO {
  return {
    id: String(o._id),
    number: o.number,
    reference: `ORD-${o.number}`,
    customer: o.customer,
    dueDate: toDateOnly(o.dueDate),
    status: deriveStatus(o),
    subtotalCents: o.totalCents, // the assessment names "subtotal"; no tax or discount
    totalCents: o.totalCents,
    paidCents: o.paidCents,
    balanceCents: o.balanceCents,
    lineItemCount,
    paymentCount,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

type RawFullOrder = RawOrder & {
  lineItems: {
    _id: Types.ObjectId;
    description: string;
    quantity: number;
    unitPriceCents: number;
    amountCents: number;
  }[];
  payments: {
    _id: Types.ObjectId;
    amountCents: number;
    paidOn: Date;
    note: string | null;
    createdAt: Date;
  }[];
};

export function toOrderDTO(o: RawFullOrder, activity?: ActivityDTO[]): OrderDTO {
  const orderId = String(o._id);
  return {
    ...baseDTO(o, o.lineItems.length, o.payments.length),
    // Array order is insertion order, which is display order for line items.
    lineItems: o.lineItems.map((l) => ({
      id: String(l._id),
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      amountCents: l.amountCents,
    })),
    // Payments are stored append-only, so the newest-first ordering happens here.
    payments: [...o.payments]
      .sort((a, b) => b.paidOn.getTime() - a.paidOn.getTime() || +b.createdAt - +a.createdAt)
      .map((p) => toPaymentDTO(p, orderId)),
    ...(activity ? { activity } : {}),
  };
}

export function toPaymentDTO(
  p: RawFullOrder["payments"][number],
  orderId: string,
): PaymentDTO {
  return {
    id: String(p._id),
    orderId,
    amountCents: p.amountCents,
    date: toDateOnly(p.paidOn),
    note: p.note ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

// ── Service ─────────────────────────────────────────────────────────────────

export async function createOrder(userId: string, input: CreateOrderInput): Promise<OrderDTO> {
  await db();
  const { lineItems, totalCents } = priceLineItems(input.lineItems);
  const number = await nextOrderNumber();

  const doc = await Order.create({
    number,
    userId: new Types.ObjectId(userId),
    customer: input.customer,
    // Written explicitly alongside `customer` on every path that sets it —
    // pipeline updates bypass Mongoose hooks, so this cannot be magic.
    customerLower: input.customer.toLowerCase(),
    dueDate: parseDateOnly(input.dueDate),
    totalCents,
    paidCents: 0,
    balanceCents: totalCents,
    fullyPaid: false,
    hasPayments: false,
    lineItems,
    payments: [],
  });

  const raw = doc.toObject() as unknown as RawFullOrder;
  await writeAudit({
    orderId: raw._id,
    userId,
    type: "order.created",
    toStatus: deriveStatus(raw),
    data: { totalCents, lineItemCount: lineItems.length },
  });
  return toOrderDTO(raw);
}

export async function listOrders(userId: string, q: ListOrdersQuery): Promise<OrderListResult> {
  await db();
  const today = todayUTC();

  // Every query on `orders` carries userId. No exceptions.
  const base: Record<string, unknown> = { userId: new Types.ObjectId(userId) };

  // Anchored prefix, so the index can serve it — an unanchored case-insensitive
  // regex cannot. True substring search would need Atlas Search.
  if (q.q) base.customerLower = { $regex: `^${escapeRegex(q.q.toLowerCase())}` };

  const dueRange =
    q.dueFrom || q.dueTo
      ? {
          ...(q.dueFrom ? { $gte: parseDateOnly(q.dueFrom) } : {}),
          ...(q.dueTo ? { $lte: parseDateOnly(q.dueTo) } : {}),
        }
      : null;

  const status = q.status ? statusFilter(q.status, today) : null;

  // A status filter and an explicit due-date range both constrain `dueDate`, so
  // merging them by spread would silently drop one bound. $and keeps both.
  const summaryFilter = dueRange ? { ...base, dueDate: dueRange } : base;
  const filter =
    dueRange && status
      ? { ...base, $and: [{ dueDate: dueRange }, status] }
      : { ...summaryFilter, ...(status ?? {}) };

  const sort: Record<string, 1 | -1> = { [q.sort]: q.dir === "asc" ? 1 : -1 };
  const skip = (q.page - 1) * q.pageSize;

  const [rows, total, money, pending, partially_paid, paid, overdue] = await Promise.all([
    Order.find(filter)
      // Pure inclusion with $size, so the list query never ships the arrays.
      // Mixing a `-field` exclusion with computed fields is rejected by MongoDB.
      .select({
        number: 1,
        customer: 1,
        dueDate: 1,
        totalCents: 1,
        paidCents: 1,
        balanceCents: 1,
        createdAt: 1,
        updatedAt: 1,
        lineItemCount: { $size: "$lineItems" },
        paymentCount: { $size: "$payments" },
      })
      .sort(sort)
      .skip(skip)
      .limit(q.pageSize)
      .lean(),
    Order.countDocuments(filter),
    Order.aggregate<{ totalCents: number; paidCents: number; balanceCents: number }>([
      { $match: summaryFilter },
      {
        $group: {
          _id: null,
          totalCents: { $sum: "$totalCents" },
          paidCents: { $sum: "$paidCents" },
          balanceCents: { $sum: "$balanceCents" },
        },
      },
    ]),
    // The four counts ignore `status` so the filter chips stay stable while a
    // filter is active. They are mutually exclusive and exhaustive, so they sum
    // to summary.count.
    Order.countDocuments({ ...summaryFilter, ...statusFilter("pending", today) }),
    Order.countDocuments({ ...summaryFilter, ...statusFilter("partially_paid", today) }),
    Order.countDocuments({ ...summaryFilter, ...statusFilter("paid", today) }),
    Order.countDocuments({ ...summaryFilter, ...statusFilter("overdue", today) }),
  ]);

  const counted = rows as unknown as (RawOrder & {
    lineItemCount: number;
    paymentCount: number;
  })[];

  return {
    data: counted.map((o) => baseDTO(o, o.lineItemCount, o.paymentCount)),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    summary: {
      count: pending + partially_paid + paid + overdue,
      totalCents: money[0]?.totalCents ?? 0,
      paidCents: money[0]?.paidCents ?? 0,
      balanceCents: money[0]?.balanceCents ?? 0,
      byStatus: { pending, partially_paid, paid, overdue },
    },
  };
}

/**
 * Every matching order, unpaginated, for the CSV export. Uses the same filter
 * shape as listOrders and the same `user_due` index; capped so one request can
 * never try to stream an unbounded result set into memory.
 */
export async function exportOrders(userId: string, q: ExportQuery): Promise<OrderSummaryDTO[]> {
  await db();
  const today = todayUTC();
  const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
  if (q.q) filter.customerLower = { $regex: `^${escapeRegex(q.q.toLowerCase())}` };

  const dueRange = {
    ...(q.from ? { $gte: parseDateOnly(q.from) } : {}),
    ...(q.to ? { $lte: parseDateOnly(q.to) } : {}),
  };
  const status = q.status ? statusFilter(q.status, today) : null;

  const query =
    Object.keys(dueRange).length && status
      ? { ...filter, $and: [{ dueDate: dueRange }, status] }
      : { ...filter, ...(Object.keys(dueRange).length ? { dueDate: dueRange } : {}), ...(status ?? {}) };

  const rows = await Order.find(query)
    .select({
      number: 1,
      customer: 1,
      dueDate: 1,
      totalCents: 1,
      paidCents: 1,
      balanceCents: 1,
      createdAt: 1,
      updatedAt: 1,
      lineItemCount: { $size: "$lineItems" },
      paymentCount: { $size: "$payments" },
    })
    .sort({ dueDate: 1 })
    .limit(10_000)
    .lean();

  return (rows as unknown as (RawOrder & { lineItemCount: number; paymentCount: number })[]).map(
    (o) => baseDTO(o, o.lineItemCount, o.paymentCount),
  );
}

export async function getOrder(userId: string, id: string): Promise<OrderDTO> {
  await db();
  assertObjectId(id);
  const order = await Order.findOne({ _id: id, userId }).lean();
  if (!order) throw notFound(); // never 403: a 403 would confirm the order exists

  const events = await AuditEvent.find({ orderId: order._id }).sort({ createdAt: -1 }).lean();
  const activity: ActivityDTO[] = events.map((e) => ({
    id: String(e._id),
    type: e.type,
    fromStatus: e.fromStatus ?? null,
    toStatus: e.toStatus ?? null,
    data: (e.data as Record<string, unknown> | null) ?? null,
    createdAt: e.createdAt.toISOString(),
  }));

  return toOrderDTO(order as unknown as RawFullOrder, activity);
}

export async function listPayments(userId: string, id: string): Promise<PaymentDTO[]> {
  await db();
  assertObjectId(id);
  const o = await Order.findOne({ _id: id, userId }).select("payments").lean();
  if (!o) throw notFound();
  return [...(o.payments as unknown as RawFullOrder["payments"])]
    .sort((a, b) => b.paidOn.getTime() - a.paidOn.getTime() || +b.createdAt - +a.createdAt)
    .map((p) => toPaymentDTO(p, id));
}

export async function updateOrder(
  userId: string,
  id: string,
  patch: UpdateOrderInput,
): Promise<OrderDTO> {
  await db();
  assertObjectId(id);

  const set: Record<string, unknown> = {};
  if (patch.customer !== undefined) {
    set.customer = patch.customer;
    set.customerLower = patch.customer.toLowerCase();
  }
  if (patch.dueDate !== undefined) set.dueDate = parseDateOnly(patch.dueDate);

  const filter: Record<string, unknown> = { _id: id, userId };

  if (patch.lineItems !== undefined) {
    const { lineItems, totalCents } = priceLineItems(patch.lineItems);
    set.lineItems = lineItems;
    set.totalCents = totalCents;
    // Safe to recompute unconditionally: the filter below guarantees paidCents is 0.
    set.balanceCents = totalCents;
    set.fullyPaid = false;
    // I10 — the precondition lives in the filter, so check and write are one op.
    filter.hasPayments = false;
  }

  // Read only to record the status transition; the guard above is what enforces
  // the rule, so this is not a read-then-write.
  const before = await Order.findOne({ _id: id, userId })
    .select("totalCents paidCents dueDate")
    .lean();

  const updated = await Order.findOneAndUpdate(
    filter,
    { $set: set },
    { returnDocument: "after" },
  ).lean();
  if (!updated) throw await lockRejection(userId, id, "lineItems");

  const raw = updated as unknown as RawFullOrder;
  await writeAudit({
    orderId: raw._id,
    userId,
    type: "order.updated",
    fromStatus: before ? deriveStatus(before) : null,
    toStatus: deriveStatus(raw),
    data: { fields: Object.keys(patch) },
  });
  return toOrderDTO(raw);
}

export async function deleteOrder(userId: string, id: string): Promise<void> {
  await db();
  assertObjectId(id);

  const doomed = await Order.findOne({ _id: id, userId })
    .select("number totalCents paidCents dueDate")
    .lean();

  const res = await Order.deleteOne({ _id: id, userId, hasPayments: false });
  if (res.deletedCount === 0) throw await lockRejection(userId, id, "delete");

  // The event outlives the order it describes — auditevents holds no ref.
  await writeAudit({
    orderId: id,
    userId,
    type: "order.deleted",
    fromStatus: doomed ? deriveStatus(doomed) : null,
    data: doomed ? { number: doomed.number, totalCents: doomed.totalCents } : null,
  });
}

/**
 * Only runs on the failure path. One cheap read decides between "there is no such
 * order" and "there is, but it is locked" — the guard already did the work.
 */
async function lockRejection(userId: string, id: string, attempted: "lineItems" | "delete") {
  const o = await Order.findOne({ _id: id, userId }).select("paidCents payments").lean();
  if (!o) return notFound();
  const lineItems = attempted === "lineItems";
  return new ApiError(
    409,
    "ORDER_LOCKED",
    lineItems
      ? "Line items cannot be changed after a payment has been recorded."
      : "An order with recorded payments cannot be deleted.",
    { paidCents: o.paidCents, paymentCount: o.payments.length },
    lineItems
      ? "Create a new order for additional work, or remove the payments first."
      : "Keep the order for the record — its payment history is part of the ledger.",
  );
}
