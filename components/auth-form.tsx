"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

/**
 * Email and password, both modes from one component.
 *
 * The error sits above the button rather than in a toast, because a sign-in
 * failure is not something to scroll away.
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
      <h1 className="font-heading text-2xl font-semibold tracking-tight">
        {isSignUp ? "Create an account" : "Sign in"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isSignUp
          ? "Your training history stays in your account, and you can export all of it as CSV at any time."
          : "Pick up where your last workout left off."}
      </p>

      <form onSubmit={submit} className="mt-6">
        <FieldGroup>
          {isSignUp ? (
            <Field>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                className="h-11 text-base"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          ) : null}

          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              className="h-11 text-base"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              required
              className="h-11 text-base"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {isSignUp ? <FieldDescription>At least eight characters.</FieldDescription> : null}
          </Field>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>
                {isSignUp ? "Couldn't create the account" : "Couldn't sign in"}
              </AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" size="touch" className="w-full" disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {pending ? "Working…" : isSignUp ? "Create account" : "Sign in"}
          </Button>
        </FieldGroup>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {isSignUp ? "Already have an account? " : "No account yet? "}
        <Button
          variant="link"
          size="sm"
          render={<Link href={isSignUp ? "/sign-in" : "/sign-up"} />}
        >
          {isSignUp ? "Sign in" : "Create one"}
        </Button>
      </p>
    </>
  );
}
