"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ORDER_STATUSES, statusLabel, type OrderStatus } from "@/lib/status";
import { STATUS_STYLES } from "./StatusBadge";
import { cn, Input } from "./ui";

/**
 * A dashboard render costs seven database operations — the page of rows, the
 * total, the money aggregation and one count per status — so search is tuned to
 * suppress requests rather than to make them cheaper.
 */
const DEBOUNCE_MS = 350;

/**
 * A one-character prefix matches almost every order: the most expensive query
 * and the least useful answer. Below this, search is simply off.
 */
const MIN_QUERY = 2;

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
  const paramsString = params.toString();

  const active = params.get("status");
  const urlQ = params.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const [isPending, startTransition] = useTransition();

  // What the URL currently reflects. Typing is compared against this rather than
  // against the previous keystroke, so deleting a character and retyping it —
  // or pasting the same term twice — issues no request at all.
  const committed = useRef(urlQ);

  const withParams = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(paramsString);
      mutate(next);
      next.delete("page");
      const qs = next.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [paramsString, pathname],
  );

  const commit = useCallback(
    (value: string) => {
      committed.current = value;
      const href = withParams((p) => (value ? p.set("q", value) : p.delete("q")));
      // replace(), not push(): pushing would leave one history entry per pause,
      // so the back button would walk you through "a", "ac", "acm".
      startTransition(() => router.replace(href, { scroll: false }));
    },
    [router, withParams],
  );

  const target = q.trim().length < MIN_QUERY ? "" : q.trim();

  // A status chip or the back button changes the URL underneath the box; that
  // wins. A change this component made itself is already in `committed`, so it
  // does not clobber whatever has been typed since.
  useEffect(() => {
    if (urlQ !== committed.current) {
      committed.current = urlQ;
      setQ(urlQ);
    }
  }, [urlQ]);

  useEffect(() => {
    if (target === committed.current) return;
    // Re-checked on fire: submitting with Enter commits early, which makes any
    // timer still in flight a no-op instead of a duplicate navigation.
    const timer = setTimeout(() => {
      if (target !== committed.current) commit(target);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [target, commit]);

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
        role="search"
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          // Anyone who knows what they are looking for skips the debounce.
          if (target !== committed.current) commit(target);
        }}
      >
        <div className="relative">
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by customer name…"
            aria-label="Search by customer name"
            aria-describedby="search-status"
            className="w-56 pr-8"
          />
          {isPending && (
            <span
              aria-hidden
              className="absolute top-1/2 right-2.5 size-2 -translate-y-1/2 animate-pulse rounded-full bg-slate-400"
            />
          )}
        </div>
        {/* Implicit submission is guaranteed with a submit control present, and
            keyboard users get an explicit one. */}
        <button type="submit" className="sr-only">
          Search
        </button>
        <p id="search-status" aria-live="polite" className="sr-only">
          {q.trim().length === 1
            ? `Type at least ${MIN_QUERY} characters to search`
            : `${total} ${total === 1 ? "order" : "orders"}`}
        </p>
      </form>
    </div>
  );
}
