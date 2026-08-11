"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ORDER_STATUSES, statusLabel, type OrderStatus } from "@/lib/status";
import { STATUS_STYLES } from "./StatusBadge";
import { Button, cn, Input } from "./ui";

/**
 * All filter state lives in the URL, so a filtered view is shareable and the back
 * button works. Changing any filter resets to page 1 — staying on page 4 of a
 * narrower result set is how you get a confusing empty screen.
 */
export function FilterBar({
  counts,
  total,
}: {
  counts: Record<OrderStatus, number>;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const active = params.get("status");
  const [q, setQ] = useState(params.get("q") ?? "");

  // Keep the box in step when the URL changes underneath it (back button, chips).
  useEffect(() => setQ(params.get("q") ?? ""), [params]);

  const withParams = (mutate: (p: URLSearchParams) => void) => {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    next.delete("page");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const chips: { key: string; label: string; count: number; href: string }[] = [
    { key: "all", label: "All", count: total, href: withParams((p) => p.delete("status")) },
    ...ORDER_STATUSES.map((s) => ({
      key: s,
      label: statusLabel(s),
      count: counts[s],
      href: withParams((p) => p.set("status", s)),
    })),
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const on = c.key === "all" ? !active : active === c.key;
          const style = c.key === "all" ? null : STATUS_STYLES[c.key as OrderStatus];
          return (
            <Link
              key={c.key}
              href={c.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                on
                  ? "bg-slate-900 text-white"
                  : cn(style?.chip ?? "bg-slate-100 text-slate-700", "hover:brightness-95"),
              )}
            >
              {c.label}
              <span className={cn("tabnum text-xs", on ? "text-slate-300" : "opacity-70")}>
                {c.count}
              </span>
            </Link>
          );
        })}
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          router.push(withParams((p) => (q ? p.set("q", q) : p.delete("q"))));
        }}
      >
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by customer name…"
          aria-label="Search by customer name"
          className="w-56"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
    </div>
  );
}
