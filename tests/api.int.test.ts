import { beforeEach, describe, expect, it } from "vitest";
import { GET as healthGET } from "@/app/api/health/route";
import {
  DELETE as orderDELETE,
  GET as orderGET,
  PATCH as orderPATCH,
} from "@/app/api/orders/[id]/route";
import {
  GET as paymentsGET,
  POST as paymentsPOST,
} from "@/app/api/orders/[id]/payments/route";
import { GET as listGET, POST as createPOST } from "@/app/api/orders/route";
import { ctx, day, hasDb, makeUser, req, resetDb } from "./setup";

const json = async (res: Response) => res.json();

/** The PDF's order: 2 x $500, due in seven days. */
const acmeOrder = (dueDate = day(7)) => ({
  customer: "Acme Corp",
  dueDate,
  lineItems: [{ description: "Consulting hours", quantity: 2, unitPriceCents: 50_000 }],
});

describe.skipIf(!hasDb)("orders API", () => {
  let cookie: string;

  beforeEach(async () => {
    await resetDb();
    ({ cookie } = await makeUser("a@test.io"));
  });

  async function createOrder(body = acmeOrder()) {
    const res = await createPOST(req("/api/orders", { method: "POST", cookie, body }), {});
    expect(res.status).toBe(201);
    return (await json(res)).order;
  }

  const pay = (id: string, amountCents: number, extra: Record<string, unknown> = {}, c = cookie) =>
    paymentsPOST(
      req(`/api/orders/${id}/payments`, {
        method: "POST",
        cookie: c,
        body: { amountCents, ...extra },
      }),
      ctx(id),
    );

  // ── 1. the sample scenario, verbatim ──────────────────────────────────────
  it("runs the assessment's sample scenario end to end", async () => {
    const order = await createOrder();
    expect(order.totalCents).toBe(100_000);
    expect(order.subtotalCents).toBe(100_000);
    expect(order.balanceCents).toBe(100_000);
    expect(order.status).toBe("pending");

    const first = await pay(order.id, 40_000, { note: "Wire 8891" });
    expect(first.status).toBe(201);
    let body = await json(first);
    expect(body.order.status).toBe("partially_paid");
    expect(body.order.balanceCents).toBe(60_000);
    expect(body.payment.amountCents).toBe(40_000);

    const second = await pay(order.id, 60_000);
    expect(second.status).toBe(201);
    body = await json(second);
    expect(body.order.status).toBe("paid");
    expect(body.order.balanceCents).toBe(0);

    const third = await pay(order.id, 100);
    expect(third.status).toBe(422);
    const err = (await json(third)).error;
    expect(err.code).toBe("OVERPAYMENT");
    expect(err.details.maxAllowedCents).toBe(0);
    expect(err.hint).toBeTruthy();
  });

  // ── 2. over-payment part way through ──────────────────────────────────────
  it("rejects $700 against a $600 balance and says what the maximum is", async () => {
    const order = await createOrder();
    await pay(order.id, 40_000);

    const res = await pay(order.id, 70_000);
    expect(res.status).toBe(422);
    const err = (await json(res)).error;
    expect(err.code).toBe("OVERPAYMENT");
    expect(err.message).toContain("$700.00");
    expect(err.message).toContain("$600.00");
    expect(err.details).toEqual({
      orderTotalCents: 100_000,
      paidCents: 40_000,
      maxAllowedCents: 60_000,
    });
    expect(err.hint).toBe("Enter $600.00 or less.");

    // ...and nothing was written.
    const after = await json(await orderGET(req(`/api/orders/${order.id}`, { cookie }), ctx(order.id)));
    expect(after.order.paidCents).toBe(40_000);
    expect(after.order.payments).toHaveLength(1);
  });

  // ── 3. ownership ──────────────────────────────────────────────────────────
  it("returns 404 — never 403 — for another user's order", async () => {
    const order = await createOrder();
    const mallory = await makeUser("b@test.io");

    const attempts = await Promise.all([
      orderGET(req(`/api/orders/${order.id}`, { cookie: mallory.cookie }), ctx(order.id)),
      orderPATCH(
        req(`/api/orders/${order.id}`, {
          method: "PATCH",
          cookie: mallory.cookie,
          body: { customer: "Pwned" },
        }),
        ctx(order.id),
      ),
      orderDELETE(
        req(`/api/orders/${order.id}`, { method: "DELETE", cookie: mallory.cookie }),
        ctx(order.id),
      ),
      pay(order.id, 100, {}, mallory.cookie),
      paymentsGET(req(`/api/orders/${order.id}/payments`, { cookie: mallory.cookie }), ctx(order.id)),
    ]);

    for (const res of attempts) {
      expect(res.status).toBe(404);
      expect((await json(res)).error.code).toBe("NOT_FOUND");
    }

    // The order is untouched.
    const mine = await json(await orderGET(req(`/api/orders/${order.id}`, { cookie }), ctx(order.id)));
    expect(mine.order.customer).toBe("Acme Corp");

    // Mallory's own list is empty, not a leak of A's orders.
    const list = await json(await listGET(req("/api/orders", { cookie: mallory.cookie }), {}));
    expect(list.total).toBe(0);
  });

  it("turns a malformed id into 404, not a 500", async () => {
    for (const bad of ["not-an-id", "123", "%20"]) {
      const res = await orderGET(req(`/api/orders/${bad}`, { cookie }), ctx(bad));
      expect(res.status).toBe(404);
      expect((await json(res)).error.code).toBe("NOT_FOUND");
    }
  });

  it("requires a session on every order route", async () => {
    const order = await createOrder();
    const anon = [
      await listGET(req("/api/orders"), {}),
      await createPOST(req("/api/orders", { method: "POST", body: acmeOrder() }), {}),
      await orderGET(req(`/api/orders/${order.id}`), ctx(order.id)),
      // Built without a cookie rather than via pay(), whose default parameter
      // would substitute the signed-in session for an undefined argument.
      await paymentsPOST(
        req(`/api/orders/${order.id}/payments`, { method: "POST", body: { amountCents: 100 } }),
        ctx(order.id),
      ),
      await orderDELETE(req(`/api/orders/${order.id}`, { method: "DELETE" }), ctx(order.id)),
    ];
    for (const res of anon) {
      expect(res.status).toBe(401);
      expect((await json(res)).error.code).toBe("UNAUTHENTICATED");
    }
  });

  // ── 4. ORDER_LOCKED ───────────────────────────────────────────────────────
  it("locks line items and deletion once a payment exists, but not the customer", async () => {
    const order = await createOrder();
    await pay(order.id, 40_000);

    const patchLines = await orderPATCH(
      req(`/api/orders/${order.id}`, {
        method: "PATCH",
        cookie,
        body: { lineItems: [{ description: "x", quantity: 1, unitPriceCents: 100 }] },
      }),
      ctx(order.id),
    );
    expect(patchLines.status).toBe(409);
    const lockErr = (await json(patchLines)).error;
    expect(lockErr.code).toBe("ORDER_LOCKED");
    expect(lockErr.details).toEqual({ paidCents: 40_000, paymentCount: 1 });

    const del = await orderDELETE(
      req(`/api/orders/${order.id}`, { method: "DELETE", cookie }),
      ctx(order.id),
    );
    expect(del.status).toBe(409);
    expect((await json(del)).error.code).toBe("ORDER_LOCKED");

    const patchCustomer = await orderPATCH(
      req(`/api/orders/${order.id}`, {
        method: "PATCH",
        cookie,
        body: { customer: "Acme Corporation", dueDate: day(30) },
      }),
      ctx(order.id),
    );
    expect(patchCustomer.status).toBe(200);
    const updated = (await json(patchCustomer)).order;
    expect(updated.customer).toBe("Acme Corporation");
    expect(updated.totalCents).toBe(100_000);
  });

  it("allows line-item edits and deletion while no payment exists", async () => {
    const order = await createOrder();
    const patched = await orderPATCH(
      req(`/api/orders/${order.id}`, {
        method: "PATCH",
        cookie,
        body: { lineItems: [{ description: "Rework", quantity: 3, unitPriceCents: 20_000 }] },
      }),
      ctx(order.id),
    );
    expect(patched.status).toBe(200);
    const body = (await json(patched)).order;
    expect(body.totalCents).toBe(60_000);
    expect(body.balanceCents).toBe(60_000);

    const del = await orderDELETE(
      req(`/api/orders/${order.id}`, { method: "DELETE", cookie }),
      ctx(order.id),
    );
    expect(del.status).toBe(204);
  });

  // ── 5. status filter parity ───────────────────────────────────────────────
  it("keeps statusFilter and deriveStatus in lockstep, and the counts summing", async () => {
    const pending = await createOrder({ ...acmeOrder(day(7)), customer: "Pending Co" });
    const partial = await createOrder({ ...acmeOrder(day(7)), customer: "Partial Co" });
    const paid = await createOrder({ ...acmeOrder(day(7)), customer: "Paid Co" });
    const overdue = await createOrder({ ...acmeOrder(day(-3)), customer: "Overdue Co" });
    await pay(partial.id, 40_000);
    await pay(paid.id, 100_000);

    const expected: Record<string, string> = {
      pending: pending.id,
      partially_paid: partial.id,
      paid: paid.id,
      overdue: overdue.id,
    };

    for (const [status, id] of Object.entries(expected)) {
      const body = await json(await listGET(req(`/api/orders?status=${status}`, { cookie }), {}));
      expect(body.data.map((o: { id: string }) => o.id)).toEqual([id]);
      // Every returned row's derived status matches the filter that produced it.
      expect(body.data[0].status).toBe(status);
    }

    const all = await json(await listGET(req("/api/orders", { cookie }), {}));
    const { byStatus, count } = all.summary;
    expect(count).toBe(4);
    expect(Object.values(byStatus).reduce((a, b) => (a as number) + (b as number), 0)).toBe(count);
    expect(byStatus).toEqual({ pending: 1, partially_paid: 1, paid: 1, overdue: 1 });

    // Money totals come from an aggregation and must agree with the rows.
    expect(all.summary.totalCents).toBe(400_000);
    expect(all.summary.paidCents).toBe(140_000);
    expect(all.summary.balanceCents).toBe(260_000);
  });

  it("holds the status counts steady while a status filter is active", async () => {
    await createOrder({ ...acmeOrder(day(7)), customer: "One" });
    await createOrder({ ...acmeOrder(day(-1)), customer: "Two" });

    const filtered = await json(await listGET(req("/api/orders?status=overdue", { cookie }), {}));
    expect(filtered.total).toBe(1);
    expect(filtered.summary.byStatus).toEqual({
      pending: 1,
      partially_paid: 0,
      paid: 0,
      overdue: 1,
    });
  });

  it("searches by anchored customer prefix and escapes regex metacharacters", async () => {
    await createOrder({ ...acmeOrder(), customer: "Acme Corp" });
    await createOrder({ ...acmeOrder(), customer: "Globex" });

    const hit = await json(await listGET(req("/api/orders?q=acme", { cookie }), {}));
    expect(hit.total).toBe(1);

    // Prefix-only, by design — documented as a limit of an index-eligible regex.
    const mid = await json(await listGET(req("/api/orders?q=corp", { cookie }), {}));
    expect(mid.total).toBe(0);

    // A metacharacter must match literally, not act as a wildcard.
    const wild = await json(await listGET(req("/api/orders?q=.*", { cookie }), {}));
    expect(wild.total).toBe(0);
  });

  it("paginates without losing or repeating rows", async () => {
    for (let i = 0; i < 5; i++) {
      await createOrder({ ...acmeOrder(), customer: `Customer ${i}` });
    }
    const p1 = await json(await listGET(req("/api/orders?pageSize=2&page=1", { cookie }), {}));
    const p2 = await json(await listGET(req("/api/orders?pageSize=2&page=2", { cookie }), {}));
    const p3 = await json(await listGET(req("/api/orders?pageSize=2&page=3", { cookie }), {}));
    expect([p1.data.length, p2.data.length, p3.data.length]).toEqual([2, 2, 1]);
    expect(p1.totalPages).toBe(3);
    const ids = [...p1.data, ...p2.data, ...p3.data].map((o: { id: string }) => o.id);
    expect(new Set(ids).size).toBe(5);

    // Past the last page is an empty list, not a 404.
    const p99 = await listGET(req("/api/orders?page=99", { cookie }), {});
    expect(p99.status).toBe(200);
    expect((await json(p99)).data).toEqual([]);
  });

  // ── 6. idempotency ────────────────────────────────────────────────────────
  it("replays an identical retry instead of charging twice", async () => {
    const order = await createOrder();
    const key = "11111111-2222-3333-4444-555555555555";
    const headers = { "idempotency-key": key };

    const first = await paymentsPOST(
      req(`/api/orders/${order.id}/payments`, {
        method: "POST",
        cookie,
        headers,
        body: { amountCents: 5_000 },
      }),
      ctx(order.id),
    );
    const retry = await paymentsPOST(
      req(`/api/orders/${order.id}/payments`, {
        method: "POST",
        cookie,
        headers,
        body: { amountCents: 5_000 },
      }),
      ctx(order.id),
    );

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.headers.get("idempotency-replayed")).toBe("true");
    expect(await json(retry)).toEqual(await json(first));

    const history = await json(
      await paymentsGET(req(`/api/orders/${order.id}/payments`, { cookie }), ctx(order.id)),
    );
    expect(history.payments).toHaveLength(1);
  });

  it("rejects the same key with a different payload", async () => {
    const order = await createOrder();
    const headers = { "idempotency-key": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" };
    await paymentsPOST(
      req(`/api/orders/${order.id}/payments`, {
        method: "POST",
        cookie,
        headers,
        body: { amountCents: 5_000 },
      }),
      ctx(order.id),
    );
    const reused = await paymentsPOST(
      req(`/api/orders/${order.id}/payments`, {
        method: "POST",
        cookie,
        headers,
        body: { amountCents: 9_999 },
      }),
      ctx(order.id),
    );
    expect(reused.status).toBe(422);
    expect((await json(reused)).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("releases the key when the payment is rejected, so a corrected retry works", async () => {
    const order = await createOrder();
    const headers = { "idempotency-key": "99999999-8888-7777-6666-555555555555" };

    const tooMuch = await paymentsPOST(
      req(`/api/orders/${order.id}/payments`, {
        method: "POST",
        cookie,
        headers,
        body: { amountCents: 999_999 },
      }),
      ctx(order.id),
    );
    expect(tooMuch.status).toBe(422);

    const corrected = await paymentsPOST(
      req(`/api/orders/${order.id}/payments`, {
        method: "POST",
        cookie,
        headers,
        body: { amountCents: 1_000 },
      }),
      ctx(order.id),
    );
    expect(corrected.status).toBe(201);
  });

  // ── 7. validation ─────────────────────────────────────────────────────────
  it("reports validation failures against the offending field", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ ...acmeOrder(), lineItems: [{ description: "x", quantity: 0, unitPriceCents: 100 }] },
        "lineItems.0.quantity"],
      [{ ...acmeOrder(), lineItems: [] }, "lineItems"],
      [{ ...acmeOrder(), customer: "" }, "customer"],
      [{ ...acmeOrder(), dueDate: "2026-02-30" }, "dueDate"],
      [{ ...acmeOrder(), dueDate: "18-08-2026" }, "dueDate"],
      [{ ...acmeOrder(), lineItems: [{ description: "x", quantity: 1, unitPriceCents: -5 }] },
        "lineItems.0.unitPriceCents"],
    ];

    for (const [body, field] of cases) {
      const res = await createPOST(req("/api/orders", { method: "POST", cookie, body }), {});
      expect(res.status, JSON.stringify(body)).toBe(422);
      const err = (await json(res)).error;
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(Object.keys(err.details.fieldErrors)).toContain(field);
      expect(err.hint).toBeTruthy();
    }
  });

  it("rejects a zero-total order, which would otherwise report as paid", async () => {
    const res = await createPOST(
      req("/api/orders", {
        method: "POST",
        cookie,
        body: { ...acmeOrder(), lineItems: [{ description: "Free", quantity: 1, unitPriceCents: 0 }] },
      }),
      {},
    );
    expect(res.status).toBe(422);
    expect((await json(res)).error.details.fieldErrors.lineItems[0]).toMatch(/at least \$0\.01/);
  });

  it("rejects a payment of zero and a payment dated in the future", async () => {
    const order = await createOrder();

    const zero = await pay(order.id, 0);
    expect(zero.status).toBe(422);
    expect((await json(zero)).error.details.fieldErrors.amountCents).toBeTruthy();

    const future = await pay(order.id, 1_000, { date: day(3) });
    expect(future.status).toBe(422);
    const err = (await json(future)).error;
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.details.fieldErrors.date[0]).toMatch(/future/i);
  });

  it("accepts a back-dated payment, even before the order existed", async () => {
    const order = await createOrder();
    const res = await pay(order.id, 1_000, { date: "2020-01-15" });
    expect(res.status).toBe(201);
    expect((await json(res)).payment.date).toBe("2020-01-15");
  });

  // ── derived-status edge cases, through the API ────────────────────────────
  it("reports an order due today as pending, and paid beats overdue", async () => {
    const dueToday = await createOrder({ ...acmeOrder(day(0)), customer: "Due Today" });
    expect(dueToday.status).toBe("pending");

    const wasOverdue = await createOrder({ ...acmeOrder(day(-30)), customer: "Late Payer" });
    expect(wasOverdue.status).toBe("overdue");
    const settled = await json(await pay(wasOverdue.id, 100_000));
    expect(settled.order.status).toBe("paid");
  });

  it("records an audit trail that outlives the order", async () => {
    const order = await createOrder();
    await pay(order.id, 40_000);

    const detail = await json(
      await orderGET(req(`/api/orders/${order.id}`, { cookie }), ctx(order.id)),
    );
    const types = detail.order.activity.map((a: { type: string }) => a.type);
    expect(types).toContain("order.created");
    expect(types).toContain("payment.recorded");

    const transition = detail.order.activity.find(
      (a: { type: string }) => a.type === "payment.recorded",
    );
    expect(transition.fromStatus).toBe("pending");
    expect(transition.toStatus).toBe("partially_paid");
  });
});

describe.skipIf(!hasDb)("health", () => {
  it("reports the database as up", async () => {
    const res = await healthGET(req("/api/health"), {});
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.db).toBe("up");
  });
});
