import { requireUser } from "@/lib/auth";
import { csvDocument } from "@/lib/csv";
import { handler } from "@/lib/http";
import { moneyPlain } from "@/lib/money";
import { exportOrders } from "@/lib/orders";
import { exportQuerySchema, searchParamsToObject } from "@/lib/validation";

// This file sits beside app/api/orders/[id]/route.ts. Next matches the static
// segment first, so /api/orders/export never reaches the dynamic route.

const HEADER = [
  "Reference",
  "Customer",
  "Status",
  "Due date",
  "Order total",
  "Amount paid",
  "Amount due",
  "Line items",
  "Payments",
  "Created",
];

export const GET = handler(async (req) => {
  const user = await requireUser(req);
  const query = exportQuerySchema.parse(searchParamsToObject(req.url));
  const orders = await exportOrders(user.id, query);

  const csv = csvDocument([
    HEADER,
    ...orders.map((o) => [
      o.reference,
      o.customer,
      o.status,
      o.dueDate,
      // Plain decimals, so a spreadsheet parses the column as numbers.
      moneyPlain(o.totalCents),
      moneyPlain(o.paidCents),
      moneyPlain(o.balanceCents),
      o.lineItemCount,
      o.paymentCount,
      o.createdAt.slice(0, 10),
    ]),
  ]);

  const range = query.from && query.to ? `-${query.from}-to-${query.to}` : "";
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="orders${range}.csv"`,
    },
  });
});
