import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Scale } from "lucide-react";
import * as React from "react";

import type { StatWindow } from "@setwise/domain/validators";
import { formatDelta, formatTonnage, formatWeight, toIsoDay } from "@setwise/domain/format";
import type { ProfileSummaryDto } from "@setwise/api-contract";
import { afterWrite, putProfileSummary } from "@/lib/cache";
import { BODYWEIGHT_TREND_DAYS } from "@setwise/domain/math";
import { orpc } from "@/lib/orpc";
import { queries } from "@/lib/queries";
import { useLazyMount } from "@/hooks/use-lazy-mount";
import { useTimeZone } from "@/hooks/use-time-zone";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

import { BodyweightChart } from "./bodyweight-chart";
import type { WeighIn } from "./bodyweight-sheet";
import { WeighInList } from "./weigh-in-list";

/** Closed until someone weighs in, and so is its number pad. */
const BodyweightSheet = React.lazy(() =>
  import("./bodyweight-sheet").then((module) => ({ default: module.BodyweightSheet })),
);

/**
 * Bodyweight against training volume, over whatever window the screen is set
 * to. The toggle above governs this the same way it governs the heatmap,
 * because 30 days has to mean one thing per screen.
 */
export function BodyweightSection({ window }: { window: StatWindow }) {
  // Sets are timestamps, so bucketing them into days is a question only the
  // reader's own zone can answer.
  const timeZone = useTimeZone();
  const [editing, setEditing] = React.useState<WeighIn | null>(null);
  const sheetMounted = useLazyMount(editing !== null);

  const queryClient = useQueryClient();
  const series = useQuery(queries.bodyweightSeries(window, timeZone));

  /**
   * The chart stays on screen while it is recalculated.
   *
   * A weigh-in moves the rolling average of the six days around it, so the
   * whole series really does have to be read again — but blanking it to a
   * skeleton to say so would hide the number that was just typed.
   */
  const afterLog = (profile: ProfileSummaryDto) => {
    putProfileSummary(queryClient, timeZone, profile);
    return afterWrite.bodyweightLogged(queryClient);
  };

  const log = useMutation(
    orpc.bodyweight.log.mutationOptions({ onSuccess: (result) => afterLog(result.profile) }),
  );
  const remove = useMutation(
    orpc.bodyweight.remove.mutationOptions({ onSuccess: (result) => afterLog(result.profile) }),
  );

  if (series.isPending) return <BodyweightSectionSkeleton />;

  if (series.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load your bodyweight</AlertTitle>
        <AlertDescription>Check your connection and try again.</AlertDescription>
      </Alert>
    );
  }

  const data = series.data;
  // The chart speaks in days, the sheet in weigh-ins. One translation, here.
  const weighIns: WeighIn[] = data.points
    .filter((point) => point.weight !== null)
    .map((point) => ({ loggedOn: point.day, weight: point.weight, note: point.note }));
  const last = data.points.at(-1);

  const today = toIsoDay();
  // Today's weigh-in, if there already is one. Opening a blank pad over a day
  // that is already logged would let someone overwrite this morning's reading
  // without ever being shown it.
  const todayWeighIn = weighIns.find((weighIn) => weighIn.loggedOn === today) ?? null;
  const openToday = () => setEditing(todayWeighIn ?? { loggedOn: today, weight: null, note: null });

  const sheet = !sheetMounted ? null : (
    <React.Suspense fallback={null}>
      <BodyweightSheet
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        initial={editing ?? { loggedOn: toIsoDay(), weight: null, note: null }}
        ghost={
          data.latest && data.latest.day !== editing?.loggedOn
            ? { weight: data.latest.weight, loggedOn: data.latest.day }
            : null
        }
        pending={log.isPending || remove.isPending}
        onSave={async (input) => {
          await log.mutateAsync({ ...input, timeZone });
          setEditing(null);
        }}
        onDelete={
          editing && editing.weight !== null
            ? async () => {
                await remove.mutateAsync({ loggedOn: editing.loggedOn, timeZone });
                setEditing(null);
              }
            : undefined
        }
      />
    </React.Suspense>
  );

  if (data.weighIns === 0) {
    return (
      <>
        <Empty className="border">
          <EmptyMedia variant="icon">
            <Scale />
          </EmptyMedia>
          <EmptyTitle>No weigh-ins in this window</EmptyTitle>
          <EmptyDescription>
            Weigh yourself at the same time of day, most days. The chart shows a{" "}
            {BODYWEIGHT_TREND_DAYS}-day average rather than the raw number, because day to day it is
            mostly water.
          </EmptyDescription>
          <EmptyContent>
            <Button size="touch" onClick={openToday}>
              <Plus data-icon="inline-start" />
              Log weight
            </Button>
          </EmptyContent>
        </Empty>
        {sheet}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-none border bg-card p-3">
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label={`${BODYWEIGHT_TREND_DAYS}-day average`}
            // Rounded to a tenth like the scale reads. An average is arithmetic,
            // so it lands on 82.38 given the chance, and the extra digit is
            // precision the number does not have.
            value={
              data.trendNow === null
                ? "—"
                : `${formatWeight(Math.round(data.trendNow * 10) / 10)} kg`
            }
            footnote={
              last && last.trendSamples > 0
                ? `from ${last.trendSamples} weigh-in${last.trendSamples === 1 ? "" : "s"}`
                : `no weigh-in in the last ${BODYWEIGHT_TREND_DAYS} days`
            }
          />
          {/*
            Trend against trend, and deliberately uncoloured. Up is not failure
            and down is not success — the app has no idea which way you are
            trying to go, and the accent colour would claim it does.
          */}
          <Stat
            label={`Change over ${window} days`}
            // A tenth of a kilo is the finest a scale reads, and the finest
            // anyone should be asked to care about.
            value={
              data.trendChange === null ? "—" : formatDelta(Math.round(data.trendChange * 10) / 10)
            }
            footnote={
              data.trendChange === null ? "needs two weigh-ins apart" : "average against average"
            }
          />
        </div>

        <BodyweightChart points={data.points} />

        <p className="text-xs text-muted-foreground">
          Line is the {BODYWEIGHT_TREND_DAYS}-day average, dots are what the scale said, bars are
          daily tonnage. {formatTonnage(data.tonnage)} over {window} days.
        </p>

        <WeighInList weighIns={weighIns} onEdit={(weighIn) => setEditing(weighIn)} />

        <Button size="touch" className="w-full" onClick={openToday}>
          <Plus data-icon="inline-start" />
          {todayWeighIn ? "Edit today's weigh-in" : "Log weight"}
        </Button>
      </div>
      {sheet}
    </>
  );
}

/** Keeps the Body screen still while a newly selected range is fetched. */
function BodyweightSectionSkeleton() {
  return (
    <div
      className="flex flex-col gap-3 rounded-none border bg-card p-3"
      aria-label="Loading bodyweight"
      aria-busy="true"
    >
      <div className="grid grid-cols-2 gap-2" aria-hidden="true">
        <StatSkeleton />
        <StatSkeleton />
      </div>

      <Skeleton className="h-[208px] w-full" aria-hidden="true" />

      <div className="flex h-8 flex-col gap-1" aria-hidden="true">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>

      <div className="overflow-hidden rounded-none border" aria-hidden="true">
        <Skeleton className="h-11 w-full bg-muted/70" />
        <Skeleton className="h-11 w-full border-t bg-muted/70" />
      </div>

      <Skeleton className="h-11 w-full" aria-hidden="true" />
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="flex h-[87px] flex-col gap-2 rounded-none border bg-background px-3 py-2.5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-3 w-28" />
    </div>
  );
}

function Stat({ label, value, footnote }: { label: string; value: string; footnote: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-none border bg-background px-3 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="numeric-display text-2xl">{value}</span>
      <span className="text-[11px] leading-tight text-muted-foreground">{footnote}</span>
    </div>
  );
}
