import type { Metadata } from "next";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { buttonClass } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";

export const metadata: Metadata = { title: "Settings · Setwise" };

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="mx-auto w-full max-w-[520px] px-4 py-4">
      <h1 className="py-2 text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">Account</h2>
        <p className="mt-1 text-sm text-ink-muted">{session?.user.email}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Export your data</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Every set you have logged, one row each, as CSV. Sets are stored in kilograms.
        </p>
        {/* A plain link, not a fetch: the browser saves the file itself, and it
            works on a phone with no JavaScript in the way. */}
        <a href="/api/export" download className={buttonClass("secondary", "md", "mt-3 w-full")}>
          Download CSV
        </a>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Units</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Everything is stored and shown in kilograms. A pounds display setting is not wired up
          yet — it would only change what you read, never what is saved.
        </p>
      </section>

      <section className="mt-10">
        <SignOutButton />
      </section>
    </div>
  );
}
