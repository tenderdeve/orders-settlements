import { statusLabel, type OrderStatus } from "@/lib/status";
import { cn } from "./ui";

// One palette, used by the badge, the filter chips and the row accents.
export const STATUS_STYLES: Record<OrderStatus, { chip: string; dot: string; accent: string }> = {
  pending: { chip: "bg-slate-100 text-slate-700", dot: "bg-slate-400", accent: "border-l-slate-300" },
  partially_paid: {
    chip: "bg-amber-100 text-amber-800",
    dot: "bg-amber-500",
    accent: "border-l-amber-400",
  },
  paid: {
    chip: "bg-emerald-100 text-emerald-800",
    dot: "bg-emerald-500",
    accent: "border-l-emerald-400",
  },
  overdue: { chip: "bg-red-100 text-red-800", dot: "bg-red-500", accent: "border-l-red-500" },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        s.chip,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} aria-hidden />
      {statusLabel(status)}
    </span>
  );
}
