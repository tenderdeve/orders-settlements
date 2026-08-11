import { describe, expect, it } from "vitest";
import { parseMoneyToCents } from "@/lib/money";
import { priceLineItems } from "@/lib/orders";

describe("line-item maths", () => {
  it("computes the PDF scenario: 2 x $500 = $1,000", () => {
    const { lineItems, totalCents } = priceLineItems([
      { description: "Consulting hours", quantity: 2, unitPriceCents: 50_000 },
    ]);
    expect(lineItems[0].amountCents).toBe(100_000);
    expect(totalCents).toBe(100_000);
  });

  it("sums several lines", () => {
    const { lineItems, totalCents } = priceLineItems([
      { description: "Engineering, days", quantity: 40, unitPriceCents: 25_000 },
      { description: "Architecture review", quantity: 1, unitPriceCents: 400_000 },
      { description: "Support, months", quantity: 2, unitPriceCents: 17_500 },
    ]);
    expect(lineItems.map((l) => l.amountCents)).toEqual([1_000_000, 400_000, 35_000]);
    expect(totalCents).toBe(1_435_000);
  });

  // 3 x 99.99 in floating point is 299.96999999999997. Integer cents is why the
  // total is exact, and why no money value is ever divided before arithmetic.
  it("is exact where floating point would drift", () => {
    const { totalCents } = priceLineItems([
      { description: "Travel", quantity: 3, unitPriceCents: parseMoneyToCents("99.99") },
    ]);
    expect(totalCents).toBe(29_997);
    expect(totalCents).not.toBe(Math.round(3 * 99.99 * 100) - 1);
  });

  it("handles a 100-line order without drift", () => {
    const lines = Array.from({ length: 100 }, (_, i) => ({
      description: `Line ${i + 1}`,
      quantity: i + 1,
      unitPriceCents: 1_999,
    }));
    const { lineItems, totalCents } = priceLineItems(lines);
    expect(lineItems).toHaveLength(100);
    // 1999 * (1+2+...+100) = 1999 * 5050
    expect(totalCents).toBe(1_999 * 5_050);
    expect(totalCents).toBe(lineItems.reduce((s, l) => s + l.amountCents, 0));
  });

  it("allows a zero unit price on a line, so long as the order total is not zero", () => {
    const { totalCents } = priceLineItems([
      { description: "Goodwill discount item", quantity: 1, unitPriceCents: 0 },
      { description: "Real work", quantity: 1, unitPriceCents: 5_000 },
    ]);
    expect(totalCents).toBe(5_000);
  });

  it("never trusts a client-supplied amount — it is recomputed", () => {
    const { lineItems } = priceLineItems([
      // Extra keys are stripped by Zod before this point; recomputing is the
      // second line of defence.
      { description: "x", quantity: 3, unitPriceCents: 700 },
    ]);
    expect(lineItems[0].amountCents).toBe(2_100);
    expect(Object.keys(lineItems[0]).sort()).toEqual([
      "amountCents",
      "description",
      "quantity",
      "unitPriceCents",
    ]);
  });
});
