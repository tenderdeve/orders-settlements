import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

// Declaring _id in the schema body is what makes it a String. Do NOT also pass
// { _id: false } in the options — that removes the field entirely.
const IdempotencyKeySchema = new Schema(
  {
    _id: { type: String, required: true }, // `${userId}:${headerValue}`
    userId: { type: Schema.Types.ObjectId, required: true },
    requestHash: { type: String, required: true }, // sha256 of the request payload
    response: { type: Schema.Types.Mixed, default: null }, // the 201 body, replayed on retry
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { versionKey: false },
);

export type IdempotencyKeyDoc = InferSchemaType<typeof IdempotencyKeySchema>;

export const IdempotencyKey: Model<IdempotencyKeyDoc> =
  (models.IdempotencyKey as Model<IdempotencyKeyDoc>) ??
  model<IdempotencyKeyDoc>("IdempotencyKey", IdempotencyKeySchema);
