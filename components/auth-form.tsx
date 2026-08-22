import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { clearAccountCache } from "@/lib/cache";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const email = z.string().trim().min(1, "Enter your email address.").email("Enter a valid email.");

const signInSchema = z.object({
  name: z.string(),
  email,
  password: z.string().min(1, "Enter your password."),
});

const signUpSchema = z.object({
  name: z.string().trim().max(80, "Keep your name under 80 characters."),
  email,
  password: z
    .string()
    .min(8, "Use at least eight characters.")
    .max(128, "Keep your password under 128 characters."),
});

type AuthValues = z.input<typeof signUpSchema>;

/**
 * Email and password, both modes from one component.
 *
 * The error sits above the button rather than in a toast, because a sign-in
 * failure is not something to scroll away.
 */
export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isSignUp = mode === "sign-up";
  const form = useForm<AuthValues>({
    resolver: zodResolver(isSignUp ? signUpSchema : signInSchema),
    defaultValues: { name: "", email: "", password: "" },
    mode: "onTouched",
    reValidateMode: "onChange",
    criteriaMode: "all",
  });

  const submit = form.handleSubmit(async (values) => {
    form.clearErrors("root");

    try {
      const result = isSignUp
        ? await authClient.signUp.email({
            email: values.email,
            password: values.password,
            name: values.name || values.email,
          })
        : await authClient.signIn.email({ email: values.email, password: values.password });

      if (result.error) {
        form.setError("root.server", {
          type: "server",
          message: result.error.message ?? "That didn't work. Check your details and try again.",
        });
        return;
      }

      // Everything cached belonged to whoever was signed in before, including
      // the route guard's own answer. Cleared rather than invalidated: there is
      // nothing here worth refetching, only rows that are no longer this
      // account's.
      clearAccountCache(queryClient);
      // A new account goes to the wizard, an existing one to Home. Every step
      // of the wizard can be skipped, so this costs a returning user nothing
      // and saves a new one from finding an empty Body screen. The protected
      // route runs its own guard against the cookie that was just set, so
      // there is no separate invalidate-then-navigate to sequence.
      await navigate({ to: isSignUp ? "/onboarding" : "/", replace: true });
    } catch {
      form.setError("root.server", {
        type: "server",
        message: "Couldn't reach the server. Check your connection and try again.",
      });
    }
  });

  const pending = form.formState.isSubmitting;
  const serverError = form.formState.errors.root?.server?.message;

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

      <form onSubmit={submit} className="mt-6" noValidate>
        <FieldGroup>
          {isSignUp ? (
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <Input
                    {...field}
                    id="name"
                    type="text"
                    autoComplete="name"
                    maxLength={80}
                    aria-invalid={fieldState.invalid}
                    className="h-11 text-base"
                  />
                  {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
                </Field>
              )}
            />
          ) : null}

          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  {...field}
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  aria-invalid={fieldState.invalid}
                  className="h-11 text-base"
                />
                {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
              </Field>
            )}
          />

          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  {...field}
                  id="password"
                  type="password"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  required
                  minLength={isSignUp ? 8 : undefined}
                  maxLength={128}
                  aria-invalid={fieldState.invalid}
                  className="h-11 text-base"
                />
                {isSignUp ? <FieldDescription>At least eight characters.</FieldDescription> : null}
                {fieldState.invalid ? <FieldError errors={[fieldState.error]} /> : null}
              </Field>
            )}
          />

          {serverError ? (
            <Alert variant="destructive">
              <AlertTitle>
                {isSignUp ? "Couldn't create the account" : "Couldn't sign in"}
              </AlertTitle>
              <AlertDescription>{serverError}</AlertDescription>
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
        <Link
          to={isSignUp ? "/sign-in" : "/sign-up"}
          className={buttonVariants({ variant: "link", size: "sm" })}
        >
          {isSignUp ? "Sign in" : "Create one"}
        </Link>
      </p>
    </>
  );
}
