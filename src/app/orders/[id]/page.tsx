import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { OrderActions } from "@/components/OrderActions";
import { PaymentForm } from "@/components/PaymentForm";
import { ActivityLog, PaymentHistory } from "@/components/PaymentHistory";
import { StatusBadge } from "@/components/StatusBadge";
import { Card } from "@/components/ui";
import { getPageUser } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/dates";
import { ApiError } from "@/lib/http";
import { formatMoney } from "@/lib/money";
import { getOrder } from "@/lib/orders";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await getPageUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const order = await getOrder(user.id, id).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />
      <main className="mx-auto max-w-4xl space-y-5 px-6 py-6">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
          ← All orders
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-slate-900">
                {order.reference} · {order.customer}
              </h1>
              <StatusBadge status={order.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Due {formatDate(order.dueDate)} · Created {formatDateTime(order.createdAt)}
            </p>
          </div>
          <OrderActions orderId={order.id} locked={order.paymentCount > 0} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: "Order total", value: order.totalCents, tone: "text-slate-900" },
            { label: "Amount paid", value: order.paidCents, tone: "text-emerald-700" },
            {
              label: "Amount due",
              value: order.balanceCents,
              tone: order.balanceCents === 0 ? "text-slate-400" : "text-amber-700",
            },
          ].map((t) => (
            <Card key={t.label} className="p-4">
              <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                {t.label}
              </p>
              <p className={`tabnum mt-1 text-xl font-semibold ${t.tone}`}>
                {formatMoney(t.value)}
              </p>
            </Card>
          ))}
        </div>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Line items</h2>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left">
                <tr className="text-xs tracking-wide text-slate-500 uppercase">
                  <th className="px-4 py-2.5 font-medium">#</th>
                  <th className="px-4 py-2.5 font-medium">Description</th>
                  <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                  <th className="px-4 py-2.5 text-right font-medium">Unit price</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.lineItems.map((l, i) => (
                  <tr key={l.id}>
                    <td className="tabnum px-4 py-2.5 text-slate-400">{i + 1}</td>
                    <td className="px-4 py-2.5 text-slate-700">{l.description}</td>
                    <td className="tabnum px-4 py-2.5 text-right text-slate-700">{l.quantity}</td>
                    <td className="tabnum px-4 py-2.5 text-right text-slate-700">
                      {formatMoney(l.unitPriceCents)}
                    </td>
                    <td className="tabnum px-4 py-2.5 text-right font-medium text-slate-900">
                      {formatMoney(l.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50">
                <tr>
                  <td colSpan={4} className="px-4 py-2 text-right text-slate-500">
                    Subtotal
                  </td>
                  <td className="tabnum px-4 py-2 text-right text-slate-700">
                    {formatMoney(order.subtotalCents)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={4} className="px-4 py-2 text-right font-medium text-slate-700">
                    Total
                  </td>
                  <td className="tabnum px-4 py-2 text-right font-semibold text-slate-900">
                    {formatMoney(order.totalCents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </section>

        <PaymentForm orderId={order.id} balanceCents={order.balanceCents} />
        <PaymentHistory payments={order.payments} />
        <ActivityLog activity={order.activity ?? []} />
      </main>
    </div>
  );
}
