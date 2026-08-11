import { Schema, model, models, type InferSchemaType, type Model, type Types } from "mongoose";

const LineItemSchema = new Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 200 },
    quantity: { type: Number, required: true, min: 1 },
    unitPriceCents: { type: Number, required: true, min: 0 },
    amountCents: { type: Number, required: true, min: 0 },
  },
  { _id: true, versionKey: false },
);

const PaymentSchema = new Schema(
  {
    amountCents: { type: Number, required: true, min: 1 },
    paidOn: { type: Date, required: true }, // UTC midnight
    note: { type: String, trim: true, maxlength: 500, default: null },
    createdAt: { type: Date, required: true },
  },
  { _id: true, versionKey: false },
);

const OrderSchema = new Schema(
  {
    number: { type: Number, required: true },
    userId: { type: Schema.Types.ObjectId, required: true, index: false },
    customer: { type: String, required: true, trim: true, maxlength: 200 },
    customerLower: { type: String, required: true }, // indexed prefix search
    dueDate: { type: Date, required: true }, // UTC midnight
    totalCents: { type: Number, required: true, min: 1 },
    paidCents: { type: Number, required: true, min: 0, default: 0 },
    balanceCents: { type: Number, required: true, min: 0 },
    // Stored rather than derived at query time so the status filters stay
    // index-eligible: a range predicate on paidCents would break ESR ordering.
    fullyPaid: { type: Boolean, required: true, default: false },
    hasPayments: { type: Boolean, required: true, default: false },
    lineItems: { type: [LineItemSchema], required: true },
    payments: { type: [PaymentSchema], default: [] },
  },
  { timestamps: true, versionKey: false, minimize: false },
);

export type OrderDoc = InferSchemaType<typeof OrderSchema> & { _id: Types.ObjectId };
export type LineItemDoc = OrderDoc["lineItems"][number];
export type PaymentDoc = OrderDoc["payments"][number];

export const Order: Model<OrderDoc> =
  (models.Order as Model<OrderDoc>) ?? model<OrderDoc>("Order", OrderSchema);
