"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui";

/**
 * Edit and Delete are disabled once a payment exists, and the server enforces the
 * same rule with ORDER_LOCKED — the disabled state is a courtesy, not the control.
 */
export function OrderActions({ orderId, locked }: { orderId: string; locked: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = locked ? "An order with recorded payments cannot be changed or deleted" : undefined;

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
    if (res.status === 204) {
      router.push("/");
      router.refresh();
      return;
    }
    setError((await res.json()).error?.message ?? "Could not delete this order.");
    setBusy(false);
    setConfirming(false);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {locked ? (
          <Button variant="secondary" disabled title={title}>
            Edit
          </Button>
        ) : (
          <Link href={`/orders/${orderId}/edit`}>
            <Button variant="secondary">Edit</Button>
          </Link>
        )}

        {confirming ? (
          <>
            <Button variant="danger" onClick={remove} disabled={busy}>
              {busy ? "Deleting…" : "Confirm delete"}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="danger"
            disabled={locked}
            title={title}
            onClick={() => setConfirming(true)}
          >
            Delete
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
