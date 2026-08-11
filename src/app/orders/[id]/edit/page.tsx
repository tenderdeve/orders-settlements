import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { OrderForm } from "@/components/OrderForm";
import { getPageUser } from "@/lib/auth";
import { ApiError } from "@/lib/http";
import { getOrder } from "@/lib/orders";

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getPageUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const order = await getOrder(user.id, id).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });

  // Customer and due date stay editable for the life of the order — correcting a
  // typo or renegotiating terms must not require deleting a paid order. Only the
  // line items lock, because changing the total under a recorded payment could
  // silently create an over-payment or resurrect a settled order.
  const locked = order.paymentCount > 0;

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />
      <main className="mx-auto max-w-3xl space-y-5 px-6 py-6">
        <Link href={`/orders/${order.id}`} className="text-sm text-slate-500 hover:text-slate-900">
          ← {order.reference}
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">
          Edit {order.reference} · {order.customer}
        </h1>
        <OrderForm initial={order} locked={locked} />
      </main>
    </div>
  );
}
