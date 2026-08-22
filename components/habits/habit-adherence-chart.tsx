import * as React from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from "recharts";

import type { HabitTrendPoint } from "@/server/queries/habits";
import { parseIsoDay } from "@/lib/format";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";

const chartConfig = {
  dailyRate: { label: "Daily", color: "var(--band-productive)" },
  sevenDayRate: { label: "7-day", color: "var(--overload)" },
  chartValue: { label: "Daily", color: "var(--band-productive)" },
} satisfies ChartConfig;

type OrbitPoint = HabitTrendPoint & {
  chartValue: number;
  color: string;
};

function displayDate(day: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, options ?? { month: "short", day: "numeric" }).format(
    parseIsoDay(day),
  );
}

function rateColor(rate: number | null): string {
  if (rate === null || rate === 0) return "var(--band-none)";
  if (rate < 50) return "var(--band-low)";
  if (rate < 100) return "var(--band-productive)";
  return "var(--band-high)";
}

function TooltipDetails({ point }: { point: HabitTrendPoint }) {
  return (
    <div className="grid min-w-40 gap-1 rounded-none border bg-background px-3 py-2 text-xs shadow-xl">
      <p className="font-medium">
        {displayDate(point.day, { weekday: "short", month: "short", day: "numeric" })}
      </p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-muted-foreground">
        <dt>Completed</dt>
        <dd className="numeric text-foreground">{point.completed}</dd>
        <dt>Eligible</dt>
        <dd className="numeric text-foreground">{point.eligible}</dd>
        <dt>Daily rate</dt>
        <dd className="numeric text-foreground">
          {point.dailyRate === null ? "—" : `${Math.round(point.dailyRate)}%`}
        </dd>
        <dt>7-day rate</dt>
        <dd className="numeric text-foreground">
          {point.sevenDayRate === null ? "—" : `${Math.round(point.sevenDayRate)}%`}
        </dd>
      </dl>
    </div>
  );
}

function TooltipContent({ active, payload }: { active?: boolean; payload?: readonly unknown[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0] as { payload?: HabitTrendPoint };
  return item.payload ? <TooltipDetails point={item.payload} /> : null;
}

function OrbitTooltip({ active, payload }: { active?: boolean; payload?: readonly unknown[] }) {
  if (!active || !payload?.length) return null;
  const item = payload[0] as { payload?: OrbitPoint };
  return item.payload ? <TooltipDetails point={item.payload} /> : null;
}

export default function HabitAdherenceChart({ points }: { points: HabitTrendPoint[] }) {
  const [entranceComplete, setEntranceComplete] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const [motionReady, setMotionReady] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(query.matches);
      setMotionReady(true);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const animate = motionReady && !reducedMotion && !entranceComplete;
  const ticks = points
    .filter((_, index) => index === 0 || index === points.length - 1 || index % 7 === 0)
    .map((point) => point.day);
  const eligible = points.reduce((sum, point) => sum + point.eligible, 0);
  const completed = points.reduce((sum, point) => sum + point.completed, 0);
  const week: OrbitPoint[] = points.slice(-7).map((point) => ({
    ...point,
    chartValue: point.dailyRate ?? 0,
    color: rateColor(point.dailyRate),
  }));
  const summary =
    eligible === 0
      ? "No eligible habit days in the last 30 days."
      : `${completed} of ${eligible} eligible habit opportunities completed over the last 30 days.`;

  return (
    <figure
      className="flex flex-col gap-4"
      aria-labelledby="habit-chart-summary"
      data-chart-animation={animate ? "enabled" : "disabled"}
    >
      <figcaption id="habit-chart-summary" className="sr-only">
        {summary} The orbit shows daily completion for the latest seven days. The lower chart shows
        30 daily rates and the rolling seven-day rate.
      </figcaption>

      <section className="grid grid-cols-[minmax(0,1fr)_6.75rem] items-center gap-2">
        <div className="relative min-w-0">
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-52 w-full"
            initialDimension={{ width: 220, height: 208 }}
          >
            <RadialBarChart
              data={week}
              accessibilityLayer
              innerRadius="28%"
              outerRadius="96%"
              barSize={7}
              startAngle={90}
              endAngle={-270}
            >
              <PolarAngleAxis
                type="number"
                domain={[0, 100]}
                dataKey="chartValue"
                tick={false}
                axisLine={false}
              />
              <ChartTooltip cursor={false} content={<OrbitTooltip />} />
              <RadialBar
                dataKey="chartValue"
                background={{ fill: "var(--muted)" }}
                cornerRadius={8}
                isAnimationActive={animate}
                animationDuration={500}
                animationEasing="ease-out"
                onAnimationEnd={() => setEntranceComplete(true)}
              >
                {week.map((point) => (
                  <Cell key={point.day} fill={point.color} />
                ))}
              </RadialBar>
            </RadialBarChart>
          </ChartContainer>
          <div
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
            aria-hidden="true"
          >
            <span className="numeric text-[11px] tracking-[0.16em] text-muted-foreground">
              LAST
            </span>
            <span className="numeric-display text-3xl leading-none">7</span>
            <span className="numeric text-[11px] tracking-[0.16em] text-muted-foreground">
              DAYS
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2" aria-label="Latest seven daily completion rates">
          {week.map((point) => (
            <div
              key={point.day}
              className="grid grid-cols-[1rem_1fr_auto] items-center gap-1.5 text-xs"
            >
              <span
                className="h-1.5 w-3 rounded-[2px]"
                style={{ backgroundColor: point.color }}
                aria-hidden="true"
              />
              <span className="text-muted-foreground">
                {displayDate(point.day, { weekday: "narrow" })}
              </span>
              <span className="numeric text-right">
                {point.dailyRate === null ? "—" : `${Math.round(point.dailyRate)}%`}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2" aria-label="30-day consistency trajectory">
        <div className="flex items-center justify-between gap-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <span>30-day trajectory</span>
          <span className="flex items-center gap-3 tracking-normal normal-case">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 bg-[var(--band-productive)]" aria-hidden="true" /> daily
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3 bg-[var(--overload)]" aria-hidden="true" /> 7-day
            </span>
          </span>
        </div>
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-32 w-full"
          initialDimension={{ width: 340, height: 128 }}
        >
          <ComposedChart
            data={points}
            accessibilityLayer
            margin={{ top: 5, right: 6, bottom: 0, left: -20 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="day"
              ticks={ticks}
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tickFormatter={(value: string) => displayDate(value)}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tickLine={false}
              axisLine={false}
              width={38}
              tickFormatter={(value: number) => `${value}%`}
            />
            <ChartTooltip cursor={false} content={<TooltipContent />} />
            <Bar
              dataKey="dailyRate"
              fill="var(--color-dailyRate)"
              radius={[2, 2, 0, 0]}
              isAnimationActive={animate}
              animationDuration={500}
              animationEasing="ease-out"
            />
            <Line
              dataKey="sevenDayRate"
              type="monotone"
              stroke="var(--color-sevenDayRate)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={animate}
              animationDuration={500}
              animationEasing="ease-out"
            />
          </ComposedChart>
        </ChartContainer>
      </section>

      <p className="text-xs text-muted-foreground">{summary}</p>
    </figure>
  );
}
