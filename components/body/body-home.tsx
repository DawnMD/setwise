import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, SlidersHorizontal } from "lucide-react";
import * as React from "react";

import type { StatWindow } from "@/db/validators";
import { formatWeight, formatWhen, parseIsoDay, toIsoDay } from "@/lib/format";
import { afterWrite, putProfileSummary } from "@/lib/cache";
import { BODYWEIGHT_TREND_DAYS } from "@/lib/math";
import { orpc } from "@/lib/orpc";
import { queries } from "@/lib/queries";
import { BODY_DEFAULT_WINDOW } from "@/lib/windows";
import { useCriticalData } from "@/hooks/use-critical-data";
import { useLazyMount } from "@/hooks/use-lazy-mount";
import { useTimeZone } from "@/hooks/use-time-zone";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BodyweightSection } from "@/components/bodyweight/bodyweight-section";
import type { WeighIn } from "@/components/bodyweight/bodyweight-sheet";
import { ProfilePrompt } from "@/components/profile/profile-prompt";
import { TargetsCard } from "@/components/profile/targets-card";
import { WindowToggle } from "@/components/progress/window-toggle";

/**
 * Both sheets start closed and most visits never open either. The profile one
 * carries nine form fields and a date picker; the weigh-in one carries the
 * number pad. Neither belongs in what this screen has to download to draw a
 * calorie target.
 */
const ProfileSheet = React.lazy(() =>
  import("@/components/profile/profile-sheet").then((module) => ({
    default: module.ProfileSheet,
  })),
);

const BodyweightSheet = React.lazy(() =>
  import("@/components/bodyweight/bodyweight-sheet").then((module) => ({
    default: module.BodyweightSheet,
  })),
);

/**
 * The Body screen.
 *
 * Today's weigh-in is first, above everything, because it is the one thing on
 * this screen that is an action rather than a readout, and it is the input the
 * rest of the screen is computed from. Everything below it — calories, macros,
 * BMI, the chart — is downstream of that one number.
 *
 * Bodyweight used to live at the bottom of Progress, where it was a fifth
 * section under a heatmap. It has its own tab now for the same reason the
 * logger does: a thing you do daily should not be something you scroll to.
 */
export function BodyHome() {
  const timeZone = useTimeZone();
  const queryClient = useQueryClient();
  const [window, setWindow] = React.useState<StatWindow>(BODY_DEFAULT_WINDOW);
  const [editingProfile, setEditingProfile] = React.useState(false);
  const [weighingIn, setWeighingIn] = React.useState<WeighIn | null>(null);
  const profileSheetMounted = useLazyMount(editingProfile);
  const weighInSheetMounted = useLazyMount(weighingIn !== null);

  const summary = useQuery(queries.profile(timeZone));
  useCriticalData(!summary.isPending);

  // Both writes return the summary the screen is drawn from, so it is written
  // straight into the cache. Re-deriving the targets here would put a second
  // copy of the calorie formulas in the browser.
  const saveProfile = useMutation(
    orpc.profile.save.mutationOptions({
      onSuccess: (profile) => putProfileSummary(queryClient, timeZone, profile),
    }),
  );
  const logWeight = useMutation(
    orpc.bodyweight.log.mutationOptions({
      onSuccess: async (result) => {
        putProfileSummary(queryClient, timeZone, result.profile);
        await afterWrite.bodyweightLogged(queryClient);
      },
    }),
  );

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-4 px-4 py-4">
      <div className="flex items-center justify-between py-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Body</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditingProfile(true)}
          disabled={!summary.isSuccess}
        >
          <SlidersHorizontal data-icon="inline-start" />
          Profile
        </Button>
      </div>

      {/* Not dismissible here. This is the screen the profile is for, so an
          empty calorie card without its explanation would be a bug wearing a
          tidy layout. */}
      <ProfilePrompt />

      <TodayWeighIn
        onLog={(weighIn) => setWeighingIn(weighIn)}
        latest={summary.data?.weight.latest ?? null}
        pending={summary.isPending}
      />

      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-sm font-semibold text-muted-foreground">Targets</h2>
        {summary.isPending ? (
          <Skeleton className="h-56 w-full" />
        ) : summary.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t load your targets</AlertTitle>
            <AlertDescription>Check your connection and try again.</AlertDescription>
          </Alert>
        ) : (
          <>
            <TargetsCard targets={summary.data.targets} />
            {/*
              Stated once, here, rather than as a footnote on every number that
              depends on it. The recalculation is the feature: a target that
              does not move as you do is a target that goes stale in a month.
            */}
            <p className="text-xs text-muted-foreground">
              Recalculated from your {BODYWEIGHT_TREND_DAYS}-day weight average every time you weigh
              in.
            </p>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold text-muted-foreground">Weight</h2>
        </div>
        <WindowToggle value={window} onChange={setWindow} />
        <BodyweightSection window={window} />
      </section>

      {profileSheetMounted ? (
        <React.Suspense fallback={null}>
          <ProfileSheet
            open={editingProfile}
            onOpenChange={setEditingProfile}
            profile={summary.data?.profile ?? null}
            pending={saveProfile.isPending}
            onSave={(patch) => saveProfile.mutateAsync({ patch, timeZone })}
          />
        </React.Suspense>
      ) : null}

      {weighInSheetMounted ? (
        <React.Suspense fallback={null}>
          <BodyweightSheet
            open={weighingIn !== null}
            onOpenChange={(open) => {
              if (!open) setWeighingIn(null);
            }}
            initial={weighingIn ?? { loggedOn: toIsoDay(), weight: null, note: null }}
            ghost={
              summary.data?.weight.latest && summary.data.weight.latest.day !== weighingIn?.loggedOn
                ? {
                    weight: summary.data.weight.latest.weight,
                    loggedOn: summary.data.weight.latest.day,
                  }
                : null
            }
            pending={logWeight.isPending}
            onSave={async (input) => {
              await logWeight.mutateAsync({ ...input, timeZone });
              setWeighingIn(null);
            }}
          />
        </React.Suspense>
      ) : null}
    </div>
  );
}

/**
 * Today's weigh-in, as the first thing on the screen.
 *
 * It says when the last one was rather than only what it read, because the
 * useful question at this point in the morning is "have I done this today",
 * and a bare number cannot answer it.
 */
function TodayWeighIn({
  latest,
  pending,
  onLog,
}: {
  latest: { day: string; weight: number; note: string | null } | null;
  pending: boolean;
  onLog: (weighIn: WeighIn) => void;
}) {
  if (pending) return <Skeleton className="h-24 w-full" />;

  const today = toIsoDay();
  const isToday = latest?.day === today;

  return (
    <div className="flex items-center justify-between gap-3 rounded-none border bg-card p-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">
          {isToday
            ? "Today"
            : latest
              ? `Last weigh-in · ${formatWhen(parseIsoDay(latest.day))}`
              : "No weigh-ins yet"}
        </span>
        <span className="numeric-display text-3xl leading-none">
          {latest ? `${formatWeight(latest.weight)} kg` : "—"}
        </span>
      </div>
      <Button
        size="touch"
        onClick={() =>
          onLog(
            // Today's row is carried through whole, note included. Opening it as
            // a blank pad would let someone overwrite this morning's reading
            // without ever being shown it.
            isToday
              ? { loggedOn: today, weight: latest.weight, note: latest.note }
              : { loggedOn: today, weight: null, note: null },
          )
        }
      >
        <Plus data-icon="inline-start" />
        {isToday ? "Edit" : "Weigh in"}
      </Button>
    </div>
  );
}
