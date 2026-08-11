import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { handler, json } from "@/lib/http";
import { deleteOrder, getOrder, updateOrder } from "@/lib/orders";
import { updateOrderSchema } from "@/lib/validation";

// Next 15+: params is a Promise in route handlers as well as in pages.
type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  return json({ order: await getOrder(user.id, id) });
});

export const PATCH = handler<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  const patch = updateOrderSchema.parse(await req.json());
  return json({ order: await updateOrder(user.id, id, patch) });
});

export const DELETE = handler<Ctx>(async (req, { params }) => {
  const user = await requireUser(req);
  const { id } = await params;
  await deleteOrder(user.id, id);
  return new NextResponse(null, { status: 204 });
});
