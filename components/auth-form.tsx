"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

/**
 * Email and password, both modes from one component.
 *
 * Errors say what broke and what to do, and they sit next to the field rather
 * than in a toast, because a sign-in failure is not something to scroll away.
 */
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const isSignUp = mode === "sign-up";

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result = isSignUp
      ? await authClient.signUp.email({ email, password, name: name.trim() || email })
      : await authClient.signIn.email({ email, password });

    if (result.error) {
      setError(result.error.message ?? "That didn't work. Check your details and try again.");
      setPending(false);
      return;
    }

    // The server layout reads the session, so the cookie has to be visible to
    // the next server render.
    router.replace("/train");
    router.refresh();
  };

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">
        {isSignUp ? "Create an account" : "Sign in"}
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        {isSignUp
          ? "Your training history stays in your account, and you can export all of it as CSV at any time."
          : "Pick up where your last workout left off."}
      </p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        {isSignUp ? (
          <Field
            label="Name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={setName}
            required={false}
          />
        ) : null}

        <Field
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={setEmail}
        />

        <Field
          label="Password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          value={password}
          onChange={setPassword}
          hint={isSignUp ? "At least eight characters." : undefined}
        />

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Working…" : isSignUp ? "Create account" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-muted">
        {isSignUp ? "Already have an account? " : "No account yet? "}
        <Link
          href={isSignUp ? "/sign-in" : "/sign-up"}
          className="text-accent underline underline-offset-4"
        >
          {isSignUp ? "Sign in" : "Create one"}
        </Link>
      </p>
    </>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  required = true,
  ...props
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
} & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  return (
    <label className="block">
      <span className="text-sm text-ink-muted">{label}</span>
      <input
        {...props}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "mt-1 h-12 w-full rounded-lg border border-border bg-surface-raised px-3 text-base",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        )}
      />
      {hint ? <span className="mt-1 block text-xs text-ink-muted">{hint}</span> : null}
    </label>
  );
}
