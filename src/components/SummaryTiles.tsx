import { formatMoney } from "@/lib/money";
import type { OrderListResult } from "@/lib/orders";
import { Card } from "./ui";

export function SummaryTiles({ summary }: { summary: OrderListResult["summary"] }) {
  const tiles = [
    { label: "Orders", value: String(summary.count) },
    { label: "Invoiced", value: formatMoney(summary.totalCents) },
    { label: "Collected", value: formatMoney(summary.paidCents) },
    { label: "Amount due", value: formatMoney(summary.balanceCents), emphasis: true },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((t) => (
        <Card key={t.label} className="p-4">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{t.label}</p>
          <p
            className={`tabnum mt-1 text-xl font-semibold ${
              t.emphasis ? "text-amber-700" : "text-slate-900"
            }`}
          >
            {t.value}
          </p>
        </Card>
      ))}
    </div>
  );
}
