import { describe, expect, it } from "vitest";
import { parseDateOnly } from "@/lib/dates";
import { deriveStatus, ORDER_STATUSES, statusFilter, statusLabel } from "@/lib/status";
import type { OrderStatus } from "@/lib/status";

const TODAY = parseDateOnly("2026-08-11");
const FUTURE = parseDateOnly("2026-08-18");
const PAST = parseDateOnly("2026-08-02");

describe("deriveStatus", () => {
  const cases: [number, number, Date, string, OrderStatus, string][] = [
    [1000, 0, FUTURE, "future", "pending", "no payments"],
    [1000, 400, FUTURE, "future", "partially_paid", "some, not all"],
    [1000, 1000, FUTURE, "future", "paid", "exact"],
    [1000, 0, PAST, "past", "overdue", "past due, unpaid"],
    [1000, 400, PAST, "past", "overdue", "overdue beats partially_paid"],
    [1000, 1000, PAST, "past", "paid", "paid beats overdue"],
    [1000, 0, TODAY, "today", "pending", "due date is inclusive"],
    [1000, 999, TODAY, "today", "partially_paid", "one cent short"],
  ];

  it.each(cases)(
    "total %i, paid %i, due %s -> %s (%s)",
    (totalCents, paidCents, dueDate, _when, expected) => {
      expect(deriveStatus({ totalCents, paidCents, dueDate }, TODAY)).toBe(expected);
    },
  );

  it("treats an order due today as not yet overdue, but overdue tomorrow", () => {
    const order = { totalCents: 1000, paidCents: 0, dueDate: TODAY };
    expect(deriveStatus(order, TODAY)).toBe("pending");
    expect(deriveStatus(order, parseDateOnly("2026-08-12"))).toBe("overdue");
  });

  // Over-payment is impossible by construction, but the ladder must not fall
  // through to `overdue` if a stored value ever exceeded the total.
  it("reports paid when paidCents somehow exceeds totalCents", () => {
    expect(deriveStatus({ totalCents: 1000, paidCents: 1200, dueDate: PAST }, TODAY)).toBe("paid");
  });
});

describe("statusFilter", () => {
  it("is mutually exclusive and exhaustive — this is why the counts sum", () => {
    // Every combination of the three stored discriminators must match exactly
    // one status filter, which is what makes the dashboard's four counts add up
    // to the total order count.
    for (const fullyPaid of [true, false]) {
      for (const hasPayments of [true, false]) {
        for (const dueDate of [PAST, TODAY, FUTURE]) {
          if (fullyPaid && !hasPayments) continue; // I7 makes this state impossible
          const matches = ORDER_STATUSES.filter((s) =>
            satisfies({ fullyPaid, hasPayments, dueDate }, statusFilter(s, TODAY)),
          );
          expect(matches).toHaveLength(1);
        }
      }
    }
  });

  it("answers `paid` from the two-field index prefix alone", () => {
    expect(statusFilter("paid", TODAY)).toEqual({ fullyPaid: true });
  });

  it("uses a strict past bound for overdue, so today is excluded", () => {
    expect(statusFilter("overdue", TODAY)).toEqual({
      fullyPaid: false,
      dueDate: { $lt: TODAY },
    });
  });

  it("agrees with deriveStatus on every stored-state combination", () => {
    for (const [paidCents, fullyPaid, hasPayments] of [
      [0, false, false],
      [400, false, true],
      [1000, true, true],
    ] as const) {
      for (const dueDate of [PAST, TODAY, FUTURE]) {
        const derived = deriveStatus({ totalCents: 1000, paidCents, dueDate }, TODAY);
        expect(satisfies({ fullyPaid, hasPayments, dueDate }, statusFilter(derived, TODAY))).toBe(
          true,
        );
      }
    }
  });
});

describe("statusLabel", () => {
  it("renders underscores as a readable label", () => {
    expect(statusLabel("partially_paid")).toBe("Partially paid");
    expect(statusLabel("overdue")).toBe("Overdue");
  });
});

/** Evaluates the subset of MongoDB filter syntax that statusFilter emits. */
function satisfies(
  doc: { fullyPaid: boolean; hasPayments: boolean; dueDate: Date },
  filter: Record<string, unknown>,
): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    const value = doc[key as keyof typeof doc];
    if (cond instanceof Date) return (value as Date).getTime() === cond.getTime();
    if (typeof cond === "object" && cond !== null) {
      const { $lt, $gte } = cond as { $lt?: Date; $gte?: Date };
      const t = (value as Date).getTime();
      if ($lt && !(t < $lt.getTime())) return false;
      if ($gte && !(t >= $gte.getTime())) return false;
      return true;
    }
    return value === cond;
  });
}
