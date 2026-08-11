import { createHash } from "node:crypto";
import { IdempotencyKey } from "@/models/IdempotencyKey";
import { isDuplicateKey } from "./db";
import { ApiError } from "./http";

const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

export type Reservation =
  | { replay: unknown }
  | { commit: (response: unknown) => Promise<void>; release: () => Promise<void> }
  | null;

/**
 * Reserve-then-commit. The insert wins the race; a duplicate key means someone
 * got here first, so we either replay their stored response or reject.
 *
 * This is the same pattern you would apply to webhook ingestion from a
 * third-party financial system.
 */
export async function reserve(
  userId: string,
  key: string | null,
  payload: unknown,
): Promise<Reservation> {
  if (!key) return null; // the header is optional
  const _id = `${userId}:${key}`; // scoped — keys cannot leak across users
  const requestHash = sha(payload);

  try {
    await IdempotencyKey.create({ _id, userId, requestHash, response: null });
  } catch (e) {
    if (!isDuplicateKey(e)) throw e;
    const prior = await IdempotencyKey.findById(_id).lean();
    if (!prior) throw e; // TTL expired mid-flight; the caller retries
    if (prior.requestHash !== requestHash) {
      throw new ApiError(
        422,
        "IDEMPOTENCY_KEY_REUSED",
        "This Idempotency-Key was already used for a different request.",
        undefined,
        "Generate a new key for a different payment.",
      );
    }
    if (prior.response == null) {
      throw new ApiError(
        409,
        "IDEMPOTENCY_IN_PROGRESS",
        "An identical request is still being processed.",
        undefined,
        "Retry in a moment.",
      );
    }
    return { replay: prior.response };
  }

  return {
    commit: async (response) => {
      await IdempotencyKey.updateOne({ _id }, { $set: { response } });
    },
    release: async () => {
      await IdempotencyKey.deleteOne({ _id });
    },
  };
}
