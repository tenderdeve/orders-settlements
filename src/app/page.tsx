import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { FilterBar } from "@/components/FilterBar";
import { OrdersTable } from "@/components/OrdersTable";
import { SummaryTiles } from "@/components/SummaryTiles";
import { Button } from "@/components/ui";
import { getPageUser } from "@/lib/auth";
import { listOrders } from "@/lib/orders";
import { listOrdersQuerySchema } from "@/lib/validation";

type SP = Record<string, string | string[] | undefined>;

export default async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await getPageUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  // Flatten repeated params and drop empty ones, so `?q=` behaves like no `q`.
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value) params[k] = value;
  }

  // A hand-edited URL must not crash the page — fall back to the defaults.
  const parsed = listOrdersQuerySchema.safeParse(params);
  const query = parsed.success ? parsed.data : listOrdersQuerySchema.parse({});

  // Server Component reads through the service layer, not over HTTP: the same
  // functions the API handlers call, without a pointless round trip.
  const result = await listOrders(user.id, query);

  return (
    <div className="min-h-screen">
      <AppHeader email={user.email} />
      <main className="mx-auto max-w-6xl space-y-5 px-6 py-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">Orders</h1>
          <Link href="/orders/new">
            <Button>+ New order</Button>
          </Link>
        </div>

        <SummaryTiles summary={result.summary} />
        <FilterBar counts={result.summary.byStatus} total={result.summary.count} />
        <OrdersTable {...result} params={params} />
      </main>
    </div>
  );
}
