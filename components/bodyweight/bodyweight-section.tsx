import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Scale } from "lucide-react";
import * as React from "react";

import type { StatWindow } from "@/db/validators";
import { formatDelta, formatTonnage, formatWeight, toIsoDay } from "@/lib/format";
import { BODYWEIGHT_TREND_DAYS } from "@/lib/math";
import { orpc } from "@/lib/orpc";
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
import { BodyweightSheet, type WeighIn } from "./bodyweight-sheet";
import { WeighInList } from "./weigh-in-list";

/**
 * Bodyweight against training volume, over whatever window the screen is set
 * to. The toggle above governs this the same way it governs the heatmap,
 * because 30 days has to mean one thing per screen.
 */
export function BodyweightSection({ window }: { window: StatWindow }) {
  // Resolved once. Sets are timestamps, so bucketing them into days is a
  // question only the reader's own zone can answer.
  const [timeZone] = React.useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [editing, setEditing] = React.useState<WeighIn | null>(null);

  const queryClient = useQueryClient();
  const series = useQuery(orpc.bodyweight.series.queryOptions({ input: { window, timeZone } }));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.bodyweight.series.key() });
  };
  const log = useMutation(orpc.bodyweight.log.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(orpc.bodyweight.remove.mutationOptions({ onSuccess: refresh }));

  if (series.isPending) return <Skeleton className="h-64 w-full" />;

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

  const sheet = (
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
        await log.mutateAsync(input);
        setEditing(null);
      }}
      onDelete={
        editing && editing.weight !== null
          ? async () => {
              await remove.mutateAsync({ loggedOn: editing.loggedOn });
              setEditing(null);
            }
          : undefined
      }
    />
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
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
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

function Stat({ label, value, footnote }: { label: string; value: string; footnote: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border bg-background px-3 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="numeric-display text-2xl">{value}</span>
      <span className="text-[11px] leading-tight text-muted-foreground">{footnote}</span>
    </div>
  );
}
