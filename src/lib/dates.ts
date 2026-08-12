/**
 * Every date-only value in this application is a Date at UTC midnight on the
 * server and a "YYYY-MM-DD" string on the wire. A Date carrying a time never
 * reaches the API surface.
 */

/** Today at 00:00:00Z. */
export function todayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/** "2026-08-18" -> Date(2026-08-18T00:00:00Z). Rejects impossible dates (2026-02-30). */
export function parseDateOnly(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error("INVALID_DATE");
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // Round-tripping catches overflow: Date.UTC(2026, 1, 30) silently becomes 2 Mar.
  if (Number.isNaN(d.getTime()) || toDateOnly(d) !== s) throw new Error("INVALID_DATE");
  return d;
}

export const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

/**
 * "11 Aug 2026, 09:10 UTC" — display only, for audit and payment timestamps.
 *
 * The zone defaults to UTC because the server cannot know the viewer's, and a
 * default that varies by host would render differently on Vercel than locally.
 * <LocalTime> passes the browser's zone once it has mounted; the label is
 * always shown so a timestamp is never ambiguous about which zone it is in.
 */
export const formatDateTime = (iso: string | Date, timeZone = "UTC") =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
    timeZoneName: "short",
  }).format(typeof iso === "string" ? new Date(iso) : iso);

/** "18 Aug 2026" — display only. */
export const formatDate = (d: Date | string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(typeof d === "string" ? parseDateOnly(d) : d);
