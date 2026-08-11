"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import type { OrderDTO } from "@/lib/orders";
import { Button, Card, ErrorNote, Field, Input } from "./ui";

type Line = { uid: number; description: string; quantity: string; unitPrice: string };

type ApiError = {
  code: string;
  message: string;
  hint?: string;
  details?: { fieldErrors?: Record<string, string[]> };
};

let nextUid = 0;
const blankLine = (): Line => ({ uid: nextUid++, description: "", quantity: "1", unitPrice: "" });

/** Returns cents, or null when the field is not yet a valid amount. */
function centsOf(value: string): number | null {
  if (!value.trim()) return null;
  try {
    return parseMoneyToCents(value);
  } catch {
    return null;
  }
}

function lineAmount(l: Line): number | null {
  const unit = centsOf(l.unitPrice);
  const qty = Number(l.quantity);
  if (unit === null || !Number.isInteger(qty) || qty < 1) return null;
  return qty * unit;
}

export function OrderForm({
  initial,
  locked = false,
}: {
  initial?: OrderDTO;
  locked?: boolean;
}) {
  const router = useRouter();
  const editing = Boolean(initial);

  const [customer, setCustomer] = useState(initial?.customer ?? "");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [lines, setLines] = useState<Line[]>(
    initial
      ? initial.lineItems.map((l) => ({
          uid: nextUid++,
          description: l.description,
          quantity: String(l.quantity),
          unitPrice: (l.unitPriceCents / 100).toFixed(2),
        }))
      : [blankLine()],
  );
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const fieldError = (name: string) => error?.details?.fieldErrors?.[name]?.[0];

  // Recomputed on every keystroke with the same function the server uses, so the
  // client and the server cannot disagree about a total.
  const amounts = lines.map(lineAmount);
  const total = amounts.reduce<number>((s, a) => s + (a ?? 0), 0);

  const patch = (uid: number, part: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...part } : l)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const lineItems = lines.map((l) => ({
      description: l.description.trim(),
      quantity: Number(l.quantity),
      unitPriceCents: centsOf(l.unitPrice) ?? Number.NaN,
    }));

    if (lineItems.some((l) => Number.isNaN(l.unitPriceCents))) {
      setError({
        code: "INVALID_MONEY",
        message: "Every line needs a unit price like 500 or 500.00.",
        hint: "Amounts use up to two decimal places.",
      });
      return;
    }

    setBusy(true);
    try {
      const body = editing
        ? { customer, dueDate, ...(locked ? {} : { lineItems }) }
        : { customer, dueDate, lineItems };
      const res = await fetch(editing ? `/api/orders/${initial!.id}` : "/api/orders", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError((await res.json()).error);
        return;
      }
      const { order } = await res.json();
      router.push(`/orders/${order.id}`);
      router.refresh();
    } catch {
      setError({ code: "NETWORK", message: "Could not reach the server.", hint: "Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Card className="space-y-4 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Customer *" error={fieldError("customer")}>
            <Input
              value={customer}
              invalid={!!fieldError("customer")}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="Acme Corp"
            />
          </Field>
          <Field
            label="Due date *"
            error={fieldError("dueDate")}
            hint="An order may be created already past due."
          >
            <Input
              type="date"
              value={dueDate}
              invalid={!!fieldError("dueDate")}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Line items</h2>
          {locked && (
            <span className="text-xs text-amber-700">
              Locked — this order has recorded payments.
            </span>
          )}
        </div>

        {fieldError("lineItems") && (
          <p className="mt-2 text-xs text-red-600">{fieldError("lineItems")}</p>
        )}

        <div className="mt-3 space-y-2">
          <div className="hidden grid-cols-[1fr_5rem_8rem_7rem_2rem] gap-2 text-xs tracking-wide text-slate-500 uppercase sm:grid">
            <span>Description</span>
            <span>Qty</span>
            <span>Unit price</span>
            <span className="text-right">Amount</span>
            <span />
          </div>

          {lines.map((l, i) => (
            <div key={l.uid} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_5rem_8rem_7rem_2rem]">
              <Input
                value={l.description}
                disabled={locked}
                invalid={!!fieldError(`lineItems.${i}.description`)}
                onChange={(e) => patch(l.uid, { description: e.target.value })}
                placeholder="Consulting hours"
                aria-label={`Line ${i + 1} description`}
              />
              <Input
                inputMode="numeric"
                value={l.quantity}
                disabled={locked}
                invalid={!!fieldError(`lineItems.${i}.quantity`)}
                onChange={(e) => patch(l.uid, { quantity: e.target.value })}
                aria-label={`Line ${i + 1} quantity`}
              />
              {/* Text, not number: the value is converted to integer cents on
                  submit, so a float never reaches the API. */}
              <Input
                inputMode="decimal"
                value={l.unitPrice}
                disabled={locked}
                invalid={!!fieldError(`lineItems.${i}.unitPriceCents`)}
                onChange={(e) => patch(l.uid, { unitPrice: e.target.value })}
                placeholder="0.00"
                aria-label={`Line ${i + 1} unit price`}
              />
              <span className="tabnum self-center text-right text-sm text-slate-700">
                {amounts[i] === null ? "—" : formatMoney(amounts[i]!)}
              </span>
              <button
                type="button"
                // The last line can never be removed; the API requires at least one.
                disabled={locked || lines.length === 1}
                onClick={() => setLines((ls) => ls.filter((x) => x.uid !== l.uid))}
                className="self-center text-slate-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label={`Remove line ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {(fieldError("lineItems.0.quantity") || fieldError("lineItems.0.description")) && (
          <p className="mt-2 text-xs text-red-600">
            {fieldError("lineItems.0.quantity") ?? fieldError("lineItems.0.description")}
          </p>
        )}

        {!locked && (
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => setLines((ls) => [...ls, blankLine()])}
          >
            + Add line
          </Button>
        )}

        <div className="mt-4 space-y-1 border-t border-slate-200 pt-3 text-sm">
          <div className="flex justify-end gap-8">
            <span className="text-slate-500">Subtotal</span>
            <span className="tabnum w-28 text-right text-slate-700">{formatMoney(total)}</span>
          </div>
          <div className="flex justify-end gap-8">
            <span className="font-medium text-slate-700">Total</span>
            <span className="tabnum w-28 text-right font-semibold text-slate-900">
              {formatMoney(total)}
            </span>
          </div>
        </div>
      </Card>

      {error && !error.details?.fieldErrors && (
        <ErrorNote message={error.message} hint={error.hint} />
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : editing ? "Save changes" : "Create order"}
        </Button>
      </div>
    </form>
  );
}
