import { Download } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Settings · Setwise" };

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-4 py-4">
      <h1 className="py-2 font-heading text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>{session?.user.email}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Export your data</CardTitle>
          <CardDescription>
            Every set you have logged, one row each, as CSV. Sets are stored in kilograms.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* A plain link, not a fetch: the browser saves the file itself, and
              it works on a phone with no JavaScript in the way. */}
          <a
            href="/api/export"
            download
            className={buttonVariants({ variant: "outline", size: "touch", className: "w-full" })}
          >
            <Download data-icon="inline-start" />
            Download CSV
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <ThemeToggle />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Units</CardTitle>
          <CardDescription>
            Everything is stored and shown in kilograms. A pounds display setting is not wired up
            yet — it would only change what you read, never what is saved.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="mt-4">
        <SignOutButton />
      </div>
    </div>
  );
}
