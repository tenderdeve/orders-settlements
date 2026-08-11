import mongoose from "mongoose";
import { db } from "@/lib/db";
import { handler, json } from "@/lib/http";

const startedAt = Date.now();

/**
 * Pings the database rather than just answering 200, so it reports the thing that
 * actually breaks. Point an external uptime monitor at it — that is what tells you
 * the cluster is unreachable before a user does.
 */
export const GET = handler(async () => {
  try {
    await db();
    await mongoose.connection.db!.admin().ping();
  } catch {
    return json({ ok: false, db: "down" }, 503);
  }
  return json({
    ok: true,
    db: "up",
    version: process.env.npm_package_version ?? "0.1.0",
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
  });
});
