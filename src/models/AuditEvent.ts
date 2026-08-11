import { Schema, model, models, type InferSchemaType, type Model, type Types } from "mongoose";

export const AUDIT_TYPES = [
  "order.created",
  "order.updated",
  "order.deleted",
  "payment.recorded",
] as const;

const AuditEventSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, required: true }, // no ref: append-only,
    userId: { type: Schema.Types.ObjectId, required: true }, // survives order deletion
    type: { type: String, required: true, enum: AUDIT_TYPES },
    fromStatus: { type: String, default: null },
    toStatus: { type: String, default: null },
    data: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

export type AuditEventDoc = InferSchemaType<typeof AuditEventSchema> & { _id: Types.ObjectId };

export const AuditEvent: Model<AuditEventDoc> =
  (models.AuditEvent as Model<AuditEventDoc>) ??
  model<AuditEventDoc>("AuditEvent", AuditEventSchema);
