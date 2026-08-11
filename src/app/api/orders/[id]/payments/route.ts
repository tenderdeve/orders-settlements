import { requireUser } from "@/lib/auth";
import { reserve } from "@/lib/idempotency";
import { handler, json } from "@/lib/http";
import { listPayments, toOrderDTO, toPaymentDTO } from "@/lib/orders";
import { recordPayment, resolvePaidOn } from "@/lib/payments";
import { createPaymentSchema } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  return json({ payments: await listPayments(user.id, id) });
});

export const POST = handler<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  const body = createPaymentSchema.parse(await req.json());
  const paidOn = resolvePaidOn(body.date);

  const slot = await reserve(user.id, req.headers.get("idempotency-key"), { orderId: id, ...body });
  if (slot && "replay" in slot) return json(slot.replay, 200, { "idempotency-replayed": "true" });

  try {
    const { payment, order } = await recordPayment(user.id, id, {
      amountCents: body.amountCents,
      paidOn,
      note: body.note ?? null,
    });
    const payload = {
      payment: toPaymentDTO(payment, id),
      order: toOrderDTO(order as unknown as Parameters<typeof toOrderDTO>[0]),
    };
    await slot?.commit(payload);
    return json(payload, 201);
  } catch (e) {
    // A business failure frees the key so the client can correct and retry.
    await slot?.release();
    throw e;
  }
});
