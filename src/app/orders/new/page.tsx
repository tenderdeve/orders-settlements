import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { OrderForm } from "@/components/OrderForm";
import { getPageUser } from "@/lib/auth";

export default async function NewOrderPage() {
  const user = await getPageUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />
      <main className="mx-auto max-w-3xl space-y-5 px-6 py-6">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
          ← All orders
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">New order</h1>
        <OrderForm />
      </main>
    </div>
  );
}
