import { describe, expect, it } from "vitest";
import { formatMoney, moneyPlain, parseMoneyToCents } from "@/lib/money";

describe("parseMoneyToCents", () => {
  it.each([
    ["1000", 100_000],
    ["1234.50", 123_450],
    ["1234.5", 123_450],
    ["$1,234.50", 123_450],
    ["  1,000.00  ", 100_000],
    ["0.01", 1],
    ["0", 0],
    ["-5.00", -500],
    [1234.5, 123_450],
    [0.01, 1],
  ])("parses %o to %i cents", (input, cents) => {
    expect(parseMoneyToCents(input)).toBe(cents);
  });

  it.each(["1.234", "abc", "", ".", "1.2.3", "1,00.000", "--1", "1e3", "NaN"])(
    "rejects %o",
    (input) => {
      expect(() => parseMoneyToCents(input)).toThrow("INVALID_MONEY");
    },
  );

  // The whole point of integer cents: 19.99 must not become 1998.9999999999998.
  it("is exact for values a float would round", () => {
    expect(parseMoneyToCents("19.99")).toBe(1999);
    expect(parseMoneyToCents("0.29")).toBe(29);
    expect(parseMoneyToCents("1234567.89")).toBe(123_456_789);
  });
});

describe("formatMoney", () => {
  it.each([
    [100_000, "$1,000.00"],
    [0, "$0.00"],
    [1, "$0.01"],
    [60_000, "$600.00"],
    [1_805_000, "$18,050.00"],
  ])("formats %i cents as %s", (cents, out) => {
    expect(formatMoney(cents)).toBe(out);
  });
});

describe("moneyPlain", () => {
  it("emits a bare decimal so spreadsheets parse it as a number", () => {
    expect(moneyPlain(100_000)).toBe("1000.00");
    expect(moneyPlain(9_999)).toBe("99.99");
    expect(moneyPlain(0)).toBe("0.00");
  });
});

describe("round trip", () => {
  it.each([1, 29, 1999, 100_000, 123_456_789])("survives %i cents", (cents) => {
    expect(parseMoneyToCents(moneyPlain(cents))).toBe(cents);
  });
});
