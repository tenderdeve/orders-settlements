"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, ErrorNote, Field, Input } from "./ui";

type ApiError = {
  code: string;
  message: string;
  hint?: string;
  details?: { fieldErrors?: Record<string, string[]> };
};

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const fieldError = (name: string) => error?.details?.fieldErrors?.[name]?.[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError({ code: "NETWORK", message: "Could not reach the server.", hint: "Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full max-w-sm p-6">
      <h1 className="text-lg font-semibold text-slate-900">
        {mode === "login" ? "Sign in" : "Create an account"}
      </h1>
      <p className="mt-1 text-sm text-slate-500">Orders &amp; Settlements</p>

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Field label="Email" error={fieldError("email")}>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            invalid={!!fieldError("email")}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </Field>

        <Field
          label="Password"
          error={fieldError("password")}
          hint={mode === "signup" ? "At least 8 characters." : undefined}
        >
          <Input
            type="password"
            name="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            value={password}
            invalid={!!fieldError("password")}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && !error.details?.fieldErrors && (
          <ErrorNote message={error.message} hint={error.hint} />
        )}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Working…" : mode === "login" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <button
        type="button"
        className="mt-4 text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900"
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setError(null);
        }}
      >
        {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
      </button>
    </Card>
  );
}
