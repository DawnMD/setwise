import * as React from "react";

import { formatDayShort, formatWeight } from "@setwise/domain/format";
import { MiniChart, type MiniChartSeries } from "@/components/ui/mini-chart";

export type BodyweightChartPoint = {
  day: string;
  weight: number | null;
  trend: number | null;
  tonnage: number;
};

/*
  Two series, one chart, on purpose: bodyweight holding while volume climbs is
  the story people actually want, and it is invisible on two charts stacked.

  The trend line is neutral rather than the accent. --overload means "you beat
  last session", and colouring a rising bodyweight with it would tell everyone
  on a cut that they are doing well. Volume is what the accent belongs to, so
  the bars carry it.
*/
const round = (value: number | null, places: number) =>
  value === null ? null : Math.round(value * 10 ** places) / 10 ** places;

export function BodyweightChart({ points }: { points: BodyweightChartPoint[] }) {
  const series = React.useMemo<MiniChartSeries[]>(
    () => [
      {
        key: "tonnage",
        label: "Tonnage",
        kind: "bar",
        axis: "right",
        color: "var(--overload)",
        opacity: 0.25,
        // Zero would draw a flat line of nothing along the axis on every rest day.
        values: points.map((point) => (point.tonnage === 0 ? null : Math.round(point.tonnage))),
        format: (value) => `${Math.round(value).toLocaleString()} kg`,
      },
      {
        // The raw weigh-ins, as dots with no line through them. Daily weight is
        // mostly water, and joining the dots draws a sawtooth that reads as
        // three kilos of progress lost overnight.
        key: "weight",
        label: "Weigh-in",
        kind: "dots",
        color: "var(--muted-foreground)",
        values: points.map((point) => round(point.weight, 2)),
        format: (value) => `${formatWeight(value)} kg`,
      },
      {
        key: "trend",
        label: "7-day average",
        kind: "line",
        color: "var(--foreground)",
        values: points.map((point) => round(point.trend, 2)),
        format: (value) => `${formatWeight(Math.round(value * 10) / 10)} kg`,
      },
    ],
    [points],
  );

  const labels = React.useMemo(() => points.map((point) => formatDayShort(point.day)), [points]);

  const weights = points
    .map((point) => point.trend ?? point.weight)
    .filter((value): value is number => value !== null);
  const first = weights.at(0);
  const last = weights.at(-1);

  return (
    <MiniChart
      labels={labels}
      series={series}
      height={208}
      // Anchored to the data. A zero baseline turns a fortnight of change into
      // a flat line two thirds up the panel.
      leftDomain={(min, max) => [min - 1, max + 1]}
      // The tonnage axis is not drawn at all. Its numbers run to five figures
      // and would eat a third of a 390px screen to say something the bars
      // already say by being taller than each other.
      rightDomain={(_, max) => [0, max]}
      summary={
        first === undefined || last === undefined
          ? "Bodyweight chart with no weigh-ins in this window."
          : `Bodyweight over ${points.length} days, from ${formatWeight(Math.round(first * 10) / 10)} to ${formatWeight(Math.round(last * 10) / 10)} kilograms, with daily training volume behind it.`
      }
    />
  );
}
