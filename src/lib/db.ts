import mongoose from "mongoose";

/** Lazy, so unit tests can import modules that import this file without a database. */
const uri = () => {
  const u = process.env.MONGODB_URI;
  if (!u) throw new Error("MONGODB_URI is not set — copy .env.example to .env");
  return u;
};

mongoose.set("autoIndex", false); // indexes are created deliberately, see scripts/migrate.ts
mongoose.set("strictQuery", true);

type Cached = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const g = globalThis as unknown as { _mongoose?: Cached };
// Mandatory: without it, dev HMR and warm serverless invocations open a new
// connection pool per module reload and exhaust the Atlas connection limit.
const cached: Cached = (g._mongoose ??= { conn: null, promise: null });

/** Await this at the top of every route handler and every Server Component. */
export async function db() {
  if (cached.conn) return cached.conn;
  cached.promise ??= mongoose.connect(uri(), {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5_000,
  });
  cached.conn = await cached.promise;
  return cached.conn;
}

/**
 * Unique-index violations surface as error code 11000. Catching this is how
 * EMAIL_TAKEN and the idempotency reservation are detected — checking first and
 * then inserting races, and the index is the real constraint either way.
 */
export const isDuplicateKey = (e: unknown) => (e as { code?: number } | null)?.code === 11000;
