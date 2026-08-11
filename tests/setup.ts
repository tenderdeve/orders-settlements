import mongoose from "mongoose";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { User } from "@/models/User";

process.env.AUTH_SECRET ??= "test-secret-not-for-production";

/**
 * The integration suites wipe every collection, so they must never be able to
 * point at a real database. Only a URI whose database name marks it as a test
 * database is accepted — anything else (an Atlas string in .env, a developer's
 * local `orders_db`) makes the integration suites skip instead of run.
 *
 * Set MONGODB_URI_TEST to override without touching MONGODB_URI.
 */
function resolveTestUri(): string | null {
  const raw = process.env.MONGODB_URI_TEST ?? process.env.MONGODB_URI;
  if (!raw) return null;
  let name: string;
  try {
    name = new URL(raw.replace(/^mongodb(\+srv)?:\/\//, "http://")).pathname.slice(1);
  } catch {
    return null;
  }
  return /(^|[_-])test/i.test(name) ? raw : null;
}

const TEST_URI = resolveTestUri();

/** Integration suites guard on this: `describe.skipIf(!hasDb)`. */
export const hasDb = TEST_URI !== null;

if (TEST_URI) process.env.MONGODB_URI = TEST_URI;

export async function resetDb() {
  await db();
  const conn = mongoose.connection.db!;
  if (!/(^|[_-])test/i.test(conn.databaseName)) {
    throw new Error(`refusing to wipe non-test database "${conn.databaseName}"`);
  }
  const cols = await conn.collections();
  // deleteMany, not drop: dropping would take the indexes and collection
  // validators with it, and the tests exist to exercise the real ones.
  await Promise.all(cols.map((c) => c.deleteMany({})));
}

export async function makeUser(email = "t@t.io") {
  const user = await User.create({ email, passwordHash: "x" });
  const id = String(user._id);
  return { id, email, cookie: `session=${await signSession({ id, email })}` };
}

type Init = { method?: string; cookie?: string; body?: unknown; headers?: Record<string, string> };

/** Build a NextRequest so route handlers can be called directly — no dev server. */
export function req(path: string, init: Init = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", ...init.headers };
  if (init.cookie) headers.cookie = init.cookie;
  return new NextRequest(`http://test.local${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

export const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** n days from today at UTC midnight, as "YYYY-MM-DD". */
export function day(offset: number): string {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + offset))
    .toISOString()
    .slice(0, 10);
}
