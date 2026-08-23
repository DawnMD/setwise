import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";

import { prefetch } from "@/lib/prefetch";
import { ProfilePrompt } from "@/components/profile/profile-prompt";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings · Setwise" }] }),
  // The profile prompt on this screen is the only thing here that reads data.
  loader: ({ context: { queryClient } }) =>
    prefetch(({ queries, resolveTimeZone, warm }) => {
      warm(queryClient, queries.profile(resolveTimeZone()));
    }),
  component: SettingsPage,
});

function SettingsPage() {
  const { session } = Route.useRouteContext();

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-4 py-4">
      <h1 className="py-2 font-heading text-2xl font-semibold tracking-tight">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>{session.user.email}</CardDescription>
        </CardHeader>
      </Card>

      {/* Not dismissible. Settings is where someone comes to find the switch
          they are missing, so this is the one screen that should always be able
          to say which answers the calorie target is still waiting on. */}
      <ProfilePrompt />

      <Card>
        <CardHeader>
          <CardTitle>Export your data</CardTitle>
          <CardDescription>
            Two CSVs: every set you have logged, one row each, and every weigh-in, one row per day.
            Both are in kilograms.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <a
            href="/api/export"
            download
            className={buttonVariants({ variant: "outline", size: "touch", className: "w-full" })}
          >
            <Download data-icon="inline-start" />
            Download sets
          </a>
          <a
            href="/api/export?data=bodyweight"
            download
            className={buttonVariants({ variant: "outline", size: "touch", className: "w-full" })}
          >
            <Download data-icon="inline-start" />
            Download bodyweight
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
