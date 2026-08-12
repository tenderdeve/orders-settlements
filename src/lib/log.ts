/**
 * Structured JSON to stdout. Vercel captures it as runtime logs, and the format
 * is drain-agnostic — it forwards to Datadog, Axiom or CloudWatch unchanged.
 *
 * Never log request bodies, passwords, session cookies, or payment amounts. A
 * request line carries method, path, status, duration, request id and the acting
 * user id, and nothing else.
 */
type Fields = Record<string, unknown>;

/**
 * APP_ENV names the environment a line came from. Vercel sets VERCEL_ENV on its
 * own (production / preview / development), so the fallback chain means preview
 * deploys label themselves without any configuration.
 */
export const APP_ENV =
  process.env.APP_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";

/**
 * Only non-production lines carry the label. An unlabelled line is production by
 * definition, so a development or preview log can never be mistaken for a real
 * one — and production logs stay free of a field that would be identical on
 * every single line.
 */
const envField: Fields = APP_ENV === "production" ? {} : { env: APP_ENV };

const emit = (level: string, f: Fields) =>
  console.log(JSON.stringify({ level, ts: new Date().toISOString(), ...envField, ...f }));

export const log = {
  info: (f: Fields) => emit("info", f),
  warn: (f: Fields) => emit("warn", f),
  error: (f: Fields) => emit("error", f),
};
