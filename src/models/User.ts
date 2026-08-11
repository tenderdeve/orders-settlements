import { Schema, model, models, type InferSchemaType, type Model, type Types } from "mongoose";

const UserSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: Types.ObjectId };

// `models.X ?? model(...)` on every model: without it, dev HMR re-registers the
// schema and throws OverwriteModelError.
export const User: Model<UserDoc> =
  (models.User as Model<UserDoc>) ?? model<UserDoc>("User", UserSchema);
