import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { ActivityDTO, PaymentDTO } from "@/lib/orders";
import { statusLabel, type OrderStatus } from "@/lib/status";
import { LocalTime } from "./LocalTime";
import { Card } from "./ui";

/**
 * Stands in for the payment form once nothing is owed. It replaces the form
 * rather than disabling it: the controls can never become usable again, and a
 * settled order has a fact to report, not an absence to explain.
 */
export function SettledPanel({ totalCents, settledOn }: { totalCents: number; settledOn?: string }) {
  return (
    <Card className="flex items-center gap-3 border-emerald-200 bg-emerald-50/60 p-4">
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white"
      >
        ✓
      </span>
      <div>
        <p className="text-sm font-medium text-emerald-900">Paid in full</p>
        <p className="mt-0.5 text-sm text-emerald-800">
          <span className="tabnum">{formatMoney(totalCents)}</span>
          {settledOn ? ` settled on ${formatDate(settledOn)}.` : " settled."}
        </p>
      </div>
    </Card>
  );
}

export function PaymentHistory({ payments }: { payments: PaymentDTO[] }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Payment history</h2>
      {payments.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-500">No payments recorded yet.</Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left">
              <tr className="text-xs tracking-wide text-slate-500 uppercase">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Note</th>
                <th className="px-4 py-2.5 font-medium">Recorded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">
                    {formatDate(p.date)}
                  </td>
                  <td className="tabnum px-4 py-2.5 text-right font-medium text-slate-900">
                    {formatMoney(p.amountCents)}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{p.note ?? "—"}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-500">
                    <LocalTime iso={p.createdAt} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </section>
  );
}

/** Renders an audit event as one readable line. */
function describe(e: ActivityDTO): string {
  const amount = typeof e.data?.amountCents === "number" ? e.data.amountCents : null;
  switch (e.type) {
    case "order.created":
      return "Order created";
    case "order.updated": {
      const fields = Array.isArray(e.data?.fields) ? (e.data.fields as string[]) : [];
      return fields.length ? `Order updated — ${fields.join(", ")}` : "Order updated";
    }
    case "order.deleted":
      return "Order deleted";
    case "payment.recorded":
      return `Payment of ${amount === null ? "" : formatMoney(amount)} recorded`;
    default:
      return e.type;
  }
}

export function ActivityLog({ activity }: { activity: ActivityDTO[] }) {
  if (!activity.length) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-slate-900">Activity</h2>
      <Card className="divide-y divide-slate-100">
        {activity.map((e) => {
          const moved = e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus;
          return (
            <div key={e.id} className="flex flex-wrap items-baseline gap-x-2 px-4 py-2.5 text-sm">
              <span className="tabnum w-56 shrink-0 whitespace-nowrap text-slate-500">
                <LocalTime iso={e.createdAt} />
              </span>
              <span className="text-slate-700">{describe(e)}</span>
              {moved && (
                <span className="text-slate-500">
                  · {statusLabel(e.fromStatus as OrderStatus)} →{" "}
                  <span className="font-medium text-slate-700">
                    {statusLabel(e.toStatus as OrderStatus)}
                  </span>
                </span>
              )}
            </div>
          );
        })}
      </Card>
    </section>
  );
}
