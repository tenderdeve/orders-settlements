"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

export function AppHeader({ email }: { email: string }) {
  const router = useRouter();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="font-semibold text-slate-900">
          Orders &amp; Settlements
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-500 sm:inline">{email}</span>
          <Button
            variant="secondary"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/login");
              router.refresh();
            }}
          >
            Log out
          </Button>
        </div>
      </div>
    </header>
  );
}
