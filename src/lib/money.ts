/**
 * Money is an integer count of cents everywhere in this application. A `Number`
 * is a double, exact for integers to 2^53 — about $90 trillion — so there is no
 * precision risk and no need for Decimal128. Dividing by 100 is for display
 * only; never divide before arithmetic.
 */

/** Parse a user-entered money string ("1,234.5", "$1234.50", 1234.5) to integer cents. */
export function parseMoneyToCents(input: string | number): number {
  const s = String(input).trim().replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) throw new Error("INVALID_MONEY");
  const neg = s.startsWith("-");
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return neg ? -cents : cents;
}

/** 100000 -> "$1,000.00" */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/** 100000 -> "1000.00" — for CSV, so spreadsheets parse it as a number. */
export const moneyPlain = (cents: number) => (cents / 100).toFixed(2);
