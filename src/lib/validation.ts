import { z } from "zod";
import { parseDateOnly } from "./dates";
import { ORDER_STATUSES } from "./status";

const isRealDate = (s: string) => {
  try {
    parseDateOnly(s);
    return true;
  } catch {
    return false;
  }
};

// The shape check alone would accept 2026-02-30. Rejecting it here rather than in
// the service layer keeps the failure on the offending field, so the client gets
// `fieldErrors["dueDate"]` and can highlight the input.
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .refine(isRealDate, "That date does not exist");

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const lineItemSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(200),
  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(1_000_000),
  unitPriceCents: z
    .number()
    .int("Unit price must be in whole cents")
    .min(0, "Unit price cannot be negative")
    .max(100_000_000),
});

export const createOrderSchema = z
  .object({
    customer: z.string().trim().min(1, "Customer is required").max(200),
    dueDate: dateOnly,
    lineItems: z.array(lineItemSchema).min(1, "Add at least one line item").max(100),
  })
  .refine((o) => o.lineItems.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0) >= 1, {
    path: ["lineItems"],
    message: "Order total must be at least $0.01",
  });

/** PATCH: all optional; sending `lineItems` requires hasPayments === false (I10). */
export const updateOrderSchema = z
  .object({
    customer: z.string().trim().min(1, "Customer is required").max(200).optional(),
    dueDate: dateOnly.optional(),
    lineItems: z.array(lineItemSchema).min(1, "Add at least one line item").max(100).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Provide at least one field to update" });

export const createPaymentSchema = z.object({
  amountCents: z
    .number()
    .int("Amount must be in whole cents")
    .min(1, "Payment must be at least $0.01"),
  date: dateOnly.optional(), // defaults to today (UTC)
  note: z.string().trim().max(500).optional(),
});

export const listOrdersQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  q: z.string().trim().max(200).optional(),
  dueFrom: dateOnly.optional(),
  dueTo: dateOnly.optional(),
  sort: z
    .enum(["createdAt", "dueDate", "totalCents", "balanceCents", "customerLower"])
    .default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * `from` and `to` bound `dueDate`, inclusive. Both are optional: the dashboard's
 * Export button should work without first forcing the user to pick a range, and
 * omitting them simply exports everything the current filters match.
 */
export const exportQuerySchema = z
  .object({
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    status: z.enum(ORDER_STATUSES).optional(),
    q: z.string().trim().max(200).optional(),
  })
  .refine((o) => !o.from || !o.to || o.from <= o.to, {
    path: ["to"],
    message: "The end of the range must not be before the start",
  });

/**
 * `searchParams.get()` returns null for absent keys and `z.coerce.number()` turns
 * null into 0, which fails `.min(1)` and 422s a valid request. Build the object so
 * absent keys are undefined, and drop empty strings so `?q=` behaves like no `q`.
 */
export function searchParamsToObject(url: string): Record<string, string> {
  const raw = Object.fromEntries(new URL(url).searchParams);
  for (const k of Object.keys(raw)) if (raw[k] === "") delete raw[k];
  return raw;
}

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type ExportQuery = z.infer<typeof exportQuerySchema>;
