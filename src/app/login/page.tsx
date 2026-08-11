import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getPageUser } from "@/lib/auth";

export default async function LoginPage() {
  if (await getPageUser()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <AuthForm />
    </main>
  );
}
