"use client";

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import { formatDayShort } from "@/lib/format";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

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

  Units live in the labels because the tooltip prints values as-is.
*/
const CHART_CONFIG = {
  tonnage: { label: "Tonnage (kg)", color: "var(--overload)" },
  trend: { label: "7-day average (kg)", color: "var(--foreground)" },
  weight: { label: "Weigh-in (kg)", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

const round = (value: number | null, places: number) =>
  value === null ? null : Math.round(value * 10 ** places) / 10 ** places;

export function BodyweightChart({ points }: { points: BodyweightChartPoint[] }) {
  const data = points.map((point) => ({
    day: point.day,
    weight: round(point.weight, 2),
    trend: round(point.trend, 2),
    // Zero would draw a flat line of nothing along the axis on every rest day.
    tonnage: point.tonnage === 0 ? null : Math.round(point.tonnage),
  }));

  return (
    <ChartContainer config={CHART_CONFIG} className="aspect-auto h-52 w-full">
      <ComposedChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          interval="preserveStartEnd"
          tickFormatter={formatDayShort}
        />
        <YAxis
          yAxisId="weight"
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          width={34}
          // Integer ticks only. Kilogram fractions on the axis produce two ticks
          // both reading 82 once they are rounded for display.
          allowDecimals={false}
          // Anchored to the data. A zero baseline turns a fortnight of change
          // into a flat line two thirds up the panel.
          domain={["dataMin - 1", "dataMax + 1"]}
          tickFormatter={(value: number) => String(Math.round(value))}
        />
        {/*
          The tonnage axis is hidden. Its numbers run to five figures and would
          eat a third of a 390px screen to say something the bars already say by
          being taller than each other; the exact figure is in the tooltip and
          the window total sits under the chart.
        */}
        <YAxis yAxisId="tonnage" orientation="right" domain={[0, "dataMax"]} hide />

        <ChartTooltip
          content={
            <ChartTooltipContent labelFormatter={(label) => formatDayShort(String(label))} />
          }
        />

        <Bar
          yAxisId="tonnage"
          dataKey="tonnage"
          fill="var(--color-tonnage)"
          fillOpacity={0.25}
          radius={2}
          isAnimationActive={false}
        />
        {/*
          The raw weigh-ins, as dots with no line through them. Daily weight is
          mostly water, and joining the dots draws a sawtooth that reads as
          three kilos of progress lost overnight. They stay on the chart because
          hiding what someone typed is worse; they just do not get a line.
        */}
        <Line
          yAxisId="weight"
          dataKey="weight"
          strokeWidth={0}
          dot={{ r: 2, fill: "var(--color-weight)" }}
          activeDot={{ r: 4 }}
          connectNulls={false}
          isAnimationActive={false}
        />
        {/*
          The trend breaks rather than bridging a gap longer than a week. Seven
          days with no weigh-in has no seven-day average, and a straight line
          across the hole would invent one.
        */}
        <Line
          yAxisId="weight"
          dataKey="trend"
          type="monotone"
          stroke="var(--color-trend)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
