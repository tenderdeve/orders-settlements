import { requireUser } from "@/lib/auth";
import { handler, json } from "@/lib/http";
import { createOrder, listOrders } from "@/lib/orders";
import { createOrderSchema, listOrdersQuerySchema, searchParamsToObject } from "@/lib/validation";

export const GET = handler(async (req) => {
  const user = await requireUser(req);
  const query = listOrdersQuerySchema.parse(searchParamsToObject(req.url));
  return json(await listOrders(user.id, query));
});

export const POST = handler(async (req) => {
  const user = await requireUser(req);
  const input = createOrderSchema.parse(await req.json());
  return json({ order: await createOrder(user.id, input) }, 201);
});
