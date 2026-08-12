"use client";

import { useRouter } from "next/navigation";
import { useState, type InputHTMLAttributes } from "react";
import { Button, Card, ErrorNote, Field, Input } from "./ui";

type ApiError = {
  code: string;
  message: string;
  hint?: string;
  details?: { fieldErrors?: Record<string, string[]> };
};

const EyeIcon = ({ off }: { off: boolean }) => (
  <svg
    aria-hidden
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-4"
  >
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="m4 4 16 16" />}
  </svg>
);

/** Password box with the reveal control inside it, so the field owns its own toggle. */
function PasswordInput({
  reveal,
  onToggle,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  reveal: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <Input {...props} type={reveal ? "text" : "password"} className="pr-10" />
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={reveal}
        aria-label={reveal ? "Hide password" : "Show password"}
        title={reveal ? "Hide password" : "Show password"}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
      >
        <EyeIcon off={reveal} />
      </button>
    </div>
  );
}

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  // Shown by default while signing up: the point of the confirm field is to let
  // someone verify what they typed before it becomes the credential they must
  // remember. Signing in has no such need, so it stays masked. Each box carries
  // its own control, so one can be re-hidden without hiding the other.
  const [revealPassword, setRevealPassword] = useState(false);
  const [revealConfirm, setRevealConfirm] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const fieldError = (name: string) => error?.details?.fieldErrors?.[name]?.[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setConfirmError(null);

    // Purely a client-side guard. The server has no use for a second copy of the
    // password, so it is never sent — the API contract stays { email, password }.
    if (mode === "signup" && password !== confirm) {
      setConfirmError("Passwords do not match.");
      return;
    }

    setBusy(true);
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
          <PasswordInput
            name="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            value={password}
            invalid={!!fieldError("password")}
            onChange={(e) => setPassword(e.target.value)}
            reveal={revealPassword}
            onToggle={() => setRevealPassword(!revealPassword)}
          />
        </Field>

        {mode === "signup" && (
          <Field label="Confirm password" error={confirmError ?? undefined}>
            <PasswordInput
              name="confirmPassword"
              autoComplete="new-password"
              required
              value={confirm}
              invalid={!!confirmError}
              onChange={(e) => {
                setConfirm(e.target.value);
                setConfirmError(null);
              }}
              reveal={revealConfirm}
              onToggle={() => setRevealConfirm(!revealConfirm)}
            />
          </Field>
        )}

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
          const next = mode === "login" ? "signup" : "login";
          setMode(next);
          setError(null);
          setConfirm("");
          setConfirmError(null);
          setRevealPassword(next === "signup");
          setRevealConfirm(next === "signup");
        }}
      >
        {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
      </button>
    </Card>
  );
}
