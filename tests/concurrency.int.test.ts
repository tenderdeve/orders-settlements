import { beforeEach, describe, expect, it } from "vitest";
import { GET as orderGET } from "@/app/api/orders/[id]/route";
import { POST as paymentsPOST } from "@/app/api/orders/[id]/payments/route";
import { POST as createPOST } from "@/app/api/orders/route";
import { ctx, day, hasDb, makeUser, req, resetDb } from "./setup";

/**
 * The design claim under test: recording a payment is a single atomic document
 * update whose over-payment guard is a $expr inside the update's *filter*. There
 * is no read-then-write window, so no interleaving of concurrent payments can
 * push paidCents past totalCents.
 */
describe.skipIf(!hasDb)("concurrent payments", () => {
  let cookie: string;

  beforeEach(async () => {
    await resetDb();
    ({ cookie } = await makeUser("c@test.io"));
  });

  async function thousandDollarOrder() {
    const res = await createPOST(
      req("/api/orders", {
        method: "POST",
        cookie,
        body: {
          customer: "Acme Corp",
          dueDate: day(7),
          lineItems: [{ description: "Consulting hours", quantity: 2, unitPriceCents: 50_000 }],
        },
      }),
      {},
    );
    return (await res.json()).order;
  }

  const pay = (id: string, amountCents: number) =>
    paymentsPOST(
      req(`/api/orders/${id}/payments`, { method: "POST", cookie, body: { amountCents } }),
      ctx(id),
    );

  const read = async (id: string) =>
    (await (await orderGET(req(`/api/orders/${id}`, { cookie }), ctx(id))).json()).order;

  it("lets exactly one of two simultaneous $600 payments through", async () => {
    const order = await thousandDollarOrder();

    const [a, b] = await Promise.all([pay(order.id, 60_000), pay(order.id, 60_000)]);
    expect([a.status, b.status].sort()).toEqual([201, 422]);

    const loser = a.status === 422 ? a : b;
    expect((await loser.json()).error.code).toBe("OVERPAYMENT");

    const after = await read(order.id);
    expect(after.paidCents).toBe(60_000);
    expect(after.payments).toHaveLength(1);
    expect(after.balanceCents).toBe(40_000);
    expect(after.status).toBe("partially_paid");
  });

  it("settles a $1,000 order exactly under fifteen concurrent $100 payments", async () => {
    const order = await thousandDollarOrder();

    const results = await Promise.all(
      Array.from({ length: 15 }, () => pay(order.id, 10_000)),
    );
    const codes = results.map((r) => r.status);
    expect(codes.filter((c) => c === 201)).toHaveLength(10);
    expect(codes.filter((c) => c === 422)).toHaveLength(5);

    const after = await read(order.id);
    expect(after.paidCents).toBe(100_000);
    expect(after.paidCents).toBeLessThanOrEqual(after.totalCents);
    expect(after.payments).toHaveLength(10);
    expect(after.balanceCents).toBe(0);
    expect(after.status).toBe("paid");
  });

  it("keeps the denormalised flags honest under contention", async () => {
    const order = await thousandDollarOrder();
    await Promise.all([pay(order.id, 100_000), pay(order.id, 1), pay(order.id, 50_000)]);

    const after = await read(order.id);
    // fullyPaid and hasPayments drive the status index, so they must never lie —
    // a collection validator enforces the same thing at the database level.
    expect(after.paidCents).toBeLessThanOrEqual(after.totalCents);
    expect(after.balanceCents).toBe(after.totalCents - after.paidCents);
    expect(after.paymentCount).toBeGreaterThan(0);
    const sum = after.payments.reduce(
      (s: number, p: { amountCents: number }) => s + p.amountCents,
      0,
    );
    expect(sum).toBe(after.paidCents);
  });

  it("does not let concurrent payments on different orders interfere", async () => {
    const [one, two] = await Promise.all([thousandDollarOrder(), thousandDollarOrder()]);
    const results = await Promise.all([
      pay(one.id, 100_000),
      pay(two.id, 100_000),
      pay(one.id, 1),
      pay(two.id, 1),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);

    for (const id of [one.id, two.id]) {
      const after = await read(id);
      expect(after.paidCents).toBe(100_000);
      expect(after.status).toBe("paid");
    }
  });
});
