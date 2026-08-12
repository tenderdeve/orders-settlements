"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toDateOnly } from "@/lib/dates";
import { formatMoney, parseMoneyToCents } from "@/lib/money";
import { Button, Card, Field, Input } from "./ui";

type ApiError = {
  code: string;
  message: string;
  hint?: string;
  details?: { maxAllowedCents?: number; fieldErrors?: Record<string, string[]> };
};

export function PaymentForm({ orderId, balanceCents }: { orderId: string; balanceCents: number }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(toDateOnly(new Date()));
  const [note, setNote] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  // One key per *attempt*, reused across retries of that attempt — so a
  // double-click or a flaky network cannot record the payment twice. Changing any
  // field starts a new attempt, and therefore a new key.
  const idempotencyKey = useRef<string | null>(null);
  const newAttempt = () => {
    idempotencyKey.current = null;
    setError(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let amountCents: number;
    try {
      amountCents = parseMoneyToCents(amount);
    } catch {
      setError({
        code: "INVALID_MONEY",
        message: "Enter an amount like 600 or 600.00.",
        hint: "Amounts use up to two decimal places.",
      });
      return;
    }
    if (amountCents < 1) {
      setError({ code: "INVALID_MONEY", message: "Payment must be at least $0.01." });
      return;
    }

    idempotencyKey.current ??= crypto.randomUUID();
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/payments`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey.current,
        },
        body: JSON.stringify({ amountCents, date, note: note || undefined }),
      });
      if (!res.ok) {
        setError((await res.json()).error);
        // The server released the key, so the corrected retry needs a fresh one.
        idempotencyKey.current = null;
        return;
      }
      setAmount("");
      setNote("");
      idempotencyKey.current = null;
      router.refresh(); // Server Component data is stale until we ask for it again
    } catch {
      setError({
        code: "NETWORK",
        message: "Could not reach the server.",
        hint: "Retry — the same payment will not be recorded twice.",
      });
    } finally {
      setBusy(false);
    }
  }

  const max = error?.details?.maxAllowedCents;

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold text-slate-900">Record a payment</h2>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-start gap-3" noValidate>
        <Field label="Amount" className="w-40">
          <Input
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            invalid={!!error}
            onChange={(e) => {
              setAmount(e.target.value);
              newAttempt();
            }}
          />
        </Field>
        <Field label="Date" className="w-44">
          <Input
            type="date"
            value={date}
            max={toDateOnly(new Date())}
            onChange={(e) => {
              setDate(e.target.value);
              newAttempt();
            }}
          />
        </Field>
        <Field label="Note" className="min-w-52 flex-1">
          <Input
            placeholder="optional…"
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              newAttempt();
            }}
          />
        </Field>
        <div className="pt-6">
          <Button type="submit" disabled={busy}>
            {busy ? "Recording…" : "Record payment"}
          </Button>
        </div>
      </form>

      <p className="mt-2 text-xs text-slate-500">
        Maximum allowed: <span className="tabnum font-medium">{formatMoney(balanceCents)}</span>
      </p>

      {error && (
        <div role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm">
          <p className="font-medium text-red-800">{error.message}</p>
          {error.hint && <p className="mt-1 text-red-700">{error.hint}</p>}
          {/* The visible payoff of an actionable error: one click to the fix. */}
          {typeof max === "number" && max > 0 && (
            <Button
              type="button"
              variant="secondary"
              className="mt-2"
              onClick={() => {
                setAmount((max / 100).toFixed(2));
                newAttempt();
              }}
            >
              Use maximum ({formatMoney(max)})
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
