import { describe, expect, it } from "vitest";
import { formatDate, parseDateOnly, todayUTC, toDateOnly } from "@/lib/dates";

describe("parseDateOnly", () => {
  it("returns UTC midnight, with no local-timezone drift", () => {
    const d = parseDateOnly("2026-08-18");
    expect(d.toISOString()).toBe("2026-08-18T00:00:00.000Z");
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
    expect(d.getUTCMilliseconds()).toBe(0);
  });

  // Date.UTC(2026, 1, 30) silently rolls over to 2 March, so the parser
  // round-trips the result and rejects any date that did not survive.
  it.each(["2026-02-30", "2026-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "2026-01-32"])(
    "rejects the impossible date %s",
    (s) => {
      expect(() => parseDateOnly(s)).toThrow("INVALID_DATE");
    },
  );

  it.each(["2026-8-18", "18-08-2026", "2026/08/18", "not-a-date", "", "2026-08-18T00:00:00Z"])(
    "rejects the malformed input %o",
    (s) => {
      expect(() => parseDateOnly(s)).toThrow("INVALID_DATE");
    },
  );

  it("accepts a real leap day", () => {
    expect(toDateOnly(parseDateOnly("2024-02-29"))).toBe("2024-02-29");
  });

  it.each(["2026-01-01", "2026-12-31", "2000-02-29", "1999-06-15"])(
    "round-trips %s",
    (s) => {
      expect(toDateOnly(parseDateOnly(s))).toBe(s);
    },
  );
});

describe("todayUTC", () => {
  it("is midnight UTC", () => {
    const t = todayUTC();
    expect(t.getUTCHours()).toBe(0);
    expect(t.getUTCMilliseconds()).toBe(0);
    expect(toDateOnly(t)).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe("formatDate", () => {
  it("renders in UTC regardless of the host timezone", () => {
    expect(formatDate("2026-08-18")).toBe("18 Aug 2026");
    expect(formatDate(parseDateOnly("2026-01-02"))).toBe("02 Jan 2026");
    // A date at UTC midnight must not display as the previous day west of GMT.
    expect(formatDate(new Date("2026-03-01T00:00:00.000Z"))).toBe("01 Mar 2026");
  });
});
