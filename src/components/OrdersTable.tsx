import Link from "next/link";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { OrderListResult } from "@/lib/orders";
import { STATUS_STYLES, StatusBadge } from "./StatusBadge";
import { Card, cn } from "./ui";

type Props = OrderListResult & { params: Record<string, string> };

const pageHref = (params: Record<string, string>, page: number) => {
  const p = new URLSearchParams(params);
  if (page <= 1) p.delete("page");
  else p.set("page", String(page));
  const qs = p.toString();
  return qs ? `/?${qs}` : "/";
};

export function OrdersTable({ data, page, totalPages, total, params }: Props) {
  if (!data.length) {
    return (
      <Card className="p-12 text-center">
        <p className="text-sm font-medium text-slate-700">No orders match this view.</p>
        <p className="mt-1 text-sm text-slate-500">
          {Object.keys(params).length
            ? "Try clearing the filters, or search for a different customer."
            : "Create your first one to get started."}
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left">
              <tr className="text-xs tracking-wide text-slate-500 uppercase">
                <th className="px-4 py-2.5 font-medium">Order</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 text-right font-medium">Order total</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount paid</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount due</th>
                <th className="px-4 py-2.5 font-medium">Due date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((o) => (
                <tr
                  key={o.id}
                  className={cn(
                    "border-l-4 hover:bg-slate-50",
                    o.status === "overdue" ? STATUS_STYLES.overdue.accent : "border-l-transparent",
                  )}
                >
                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                    <Link href={`/orders/${o.id}`} className="text-slate-900 hover:underline">
                      {o.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/orders/${o.id}`} className="text-slate-700 hover:underline">
                      {o.customer}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="tabnum px-4 py-3 text-right text-slate-700">
                    {formatMoney(o.totalCents)}
                  </td>
                  <td className="tabnum px-4 py-3 text-right text-slate-700">
                    {formatMoney(o.paidCents)}
                  </td>
                  <td
                    className={cn(
                      "tabnum px-4 py-3 text-right font-medium",
                      o.balanceCents === 0 ? "text-slate-400" : "text-slate-900",
                    )}
                  >
                    {formatMoney(o.balanceCents)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    {formatDate(o.dueDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>
          {data.length} of {total} order{total === 1 ? "" : "s"}
        </span>
        {totalPages > 1 && (
          <nav className="flex items-center gap-3">
            <PageLink href={pageHref(params, page - 1)} disabled={page <= 1}>
              ‹ Prev
            </PageLink>
            <span className="tabnum">
              {page} / {totalPages}
            </span>
            <PageLink href={pageHref(params, page + 1)} disabled={page >= totalPages}>
              Next ›
            </PageLink>
          </nav>
        )}
      </div>
    </>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) return <span className="cursor-not-allowed text-slate-300">{children}</span>;
  return (
    <Link href={href} className="text-slate-700 hover:underline">
      {children}
    </Link>
  );
}
