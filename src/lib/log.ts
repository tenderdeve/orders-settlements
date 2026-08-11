/**
 * Structured JSON to stdout. Vercel captures it as runtime logs, and the format
 * is drain-agnostic — it forwards to Datadog, Axiom or CloudWatch unchanged.
 *
 * Never log request bodies, passwords, session cookies, or payment amounts. A
 * request line carries method, path, status, duration, request id and the acting
 * user id, and nothing else.
 */
type Fields = Record<string, unknown>;

const emit = (level: string, f: Fields) =>
  console.log(JSON.stringify({ level, ts: new Date().toISOString(), ...f }));

export const log = {
  info: (f: Fields) => emit("info", f),
  warn: (f: Fields) => emit("warn", f),
  error: (f: Fields) => emit("error", f),
};
