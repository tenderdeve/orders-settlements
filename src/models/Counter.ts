import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const CounterSchema = new Schema(
  { _id: { type: String, required: true }, seq: { type: Number, required: true, default: 0 } },
  { versionKey: false },
);

export type CounterDoc = InferSchemaType<typeof CounterSchema>;

export const Counter: Model<CounterDoc> =
  (models.Counter as Model<CounterDoc>) ?? model<CounterDoc>("Counter", CounterSchema);

/** Atomic sequence. The standard MongoDB counter idiom. */
export async function nextOrderNumber(): Promise<number> {
  const c = await Counter.findOneAndUpdate(
    { _id: "orderNumber" },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after", projection: { seq: 1 } },
  ).lean();
  return c!.seq;
}
