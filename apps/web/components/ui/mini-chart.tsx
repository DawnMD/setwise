import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The app's chart.
 *
 * Two charts were drawn with Recharts, which arrived as roughly 104 KB gzip of
 * shared code on a screen whose job is to show a line and some bars. What those
 * two charts actually need is a path, some rects, three ticks and a readout —
 * about a tenth of the surface area, and none of the animation, none of the
 * responsive-container remounting, and none of the SVG-in-React reconciliation
 * that made a 90-point series expensive to redraw.
 *
 * Deliberately not a general charting library. It draws lines, dots and bars
 * against one or two value axes, and when a third kind of chart is needed the
 * right move is to look at what that screen is for rather than to grow this.
 */

const PADDING = { left: 34, right: 8, top: 8, bottom: 18 };
/** Used for the first paint, before the container has been measured. */
const FALLBACK_WIDTH = 360;

type Axis = "left" | "right";

export type MiniChartSeries = {
  key: string;
  label: string;
  /** `dots` is a line's points with no line through them. */
  kind: "line" | "dots" | "bar";
  /** Any CSS colour. The call sites pass theme variables. */
  color: string;
  axis?: Axis;
  /** One entry per x position. Null is a gap, never a zero. */
  values: Array<number | null>;
  format: (value: number) => string;
  /** Line only: how thick, in px. */
  width?: number;
  /** Line only: draw a dot at every point as well as the line. */
  showPoints?: boolean;
  /** Bar only: 0 to 1. */
  opacity?: number;
};

export type MiniChartProps = {
  /** One label per x position. Drives the ticks, the readout and the summary. */
  labels: string[];
  /**
   * Numeric x positions, when the spacing is meaningful.
   *
   * The exercise trend is one point per session, and sessions are not evenly
   * spaced in time. Omitted, positions are even, which is right for a dense
   * day-by-day series where every slot exists whether or not it has a value.
   */
  positions?: number[];
  series: MiniChartSeries[];
  height?: number;
  /** Pads the value axis away from the data. A zero baseline flattens a trend. */
  leftDomain?: (min: number, max: number) => [number, number];
  rightDomain?: (min: number, max: number) => [number, number];
  /** How the left axis prints its three ticks. */
  formatLeftTick?: (value: number) => string;
  /** One sentence describing the shape, for anyone who cannot see it. */
  summary: string;
  className?: string;
};

/** The container's width, so the view box matches its pixels and nothing stretches. */
function useMeasuredWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = React.useState(FALLBACK_WIDTH);

  React.useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

function extent(series: MiniChartSeries[], axis: Axis): [number, number] | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const entry of series) {
    if ((entry.axis ?? "left") !== axis) continue;
    for (const value of entry.values) {
      if (value === null || !Number.isFinite(value)) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  return min === Number.POSITIVE_INFINITY ? null : [min, max];
}

export function MiniChart({
  labels,
  positions,
  series,
  height = 176,
  leftDomain,
  rightDomain,
  formatLeftTick = (value) => String(Math.round(value)),
  summary,
  className,
}: MiniChartProps) {
  const container = React.useRef<HTMLDivElement>(null);
  const width = useMeasuredWidth(container);
  const [active, setActive] = React.useState<number | null>(null);

  const innerWidth = Math.max(1, width - PADDING.left - PADDING.right);
  const innerHeight = Math.max(1, height - PADDING.top - PADDING.bottom);
  const count = labels.length;

  const xs = React.useMemo(() => {
    if (count === 0) return [];
    if (!positions) {
      // Half a slot in from each edge, so a bar at either end is not clipped.
      const step = innerWidth / count;
      return labels.map((_, index) => PADDING.left + step * (index + 0.5));
    }
    const low = Math.min(...positions);
    const high = Math.max(...positions);
    const span = high - low || 1;
    return positions.map((value) => PADDING.left + ((value - low) / span) * innerWidth);
  }, [count, innerWidth, labels, positions]);

  const scales = React.useMemo(() => {
    const build = (axis: Axis, pad?: (min: number, max: number) => [number, number]) => {
      const found = extent(series, axis);
      if (!found) return null;
      const [low, high] = pad ? pad(found[0], found[1]) : found;
      // A flat series still has to be drawn somewhere, so give it a band.
      const span = high - low || Math.max(1, Math.abs(high) * 0.1);
      return { low, high: low + span, span };
    };

    return { left: build("left", leftDomain), right: build("right", rightDomain) };
  }, [series, leftDomain, rightDomain]);

  const y = (value: number, axis: Axis) => {
    const scale = scales[axis];
    if (!scale) return PADDING.top + innerHeight;
    const ratio = (value - scale.low) / scale.span;
    return PADDING.top + innerHeight - ratio * innerHeight;
  };

  const leftTicks = React.useMemo(() => {
    const scale = scales.left;
    if (!scale) return [];
    return [0, 0.5, 1].map((ratio) => scale.low + scale.span * ratio);
  }, [scales.left]);

  // First, middle and last. More than three x labels is unreadable at 390px,
  // and the readout carries the exact date for whichever point is touched.
  const xTicks = React.useMemo(() => {
    if (count === 0) return [];
    if (count <= 2) return labels.map((_, index) => index);
    return [0, Math.floor((count - 1) / 2), count - 1];
  }, [count, labels]);

  const nearestIndex = (clientX: number) => {
    const bounds = container.current?.getBoundingClientRect();
    if (!bounds || xs.length === 0) return null;
    const offset = clientX - bounds.left;

    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < xs.length; index += 1) {
      const distance = Math.abs(xs[index] - offset);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    return best;
  };

  const activeSeries =
    active === null
      ? []
      : series
          .map((entry) => ({ entry, value: entry.values[active] }))
          .filter(
            (candidate): candidate is { entry: MiniChartSeries; value: number } =>
              candidate.value !== null && candidate.value !== undefined,
          );

  const readout =
    active === null
      ? ""
      : `${labels[active]}: ${activeSeries
          .map(({ entry, value }) => `${entry.label} ${entry.format(value)}`)
          .join(", ")}`;

  return (
    <div className={cn("relative w-full select-none", className)}>
      <div
        ref={container}
        // One focus stop with arrow-key movement, rather than a tab stop per
        // point: ninety days of weigh-ins would otherwise be ninety of them
        // between this chart and the button under it.
        tabIndex={0}
        role="img"
        aria-label={summary}
        className="w-full rounded-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onPointerMove={(event) => setActive(nearestIndex(event.clientX))}
        onPointerDown={(event) => setActive(nearestIndex(event.clientX))}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const step = event.key === "ArrowLeft" ? -1 : 1;
          setActive((current) => {
            const next = (current ?? (step > 0 ? -1 : count)) + step;
            return Math.min(count - 1, Math.max(0, next));
          });
        }}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="overflow-visible"
          aria-hidden
        >
          {leftTicks.map((value) => {
            const position = y(value, "left");
            return (
              <g key={value}>
                <line
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={position}
                  y2={position}
                  className="stroke-border"
                  strokeWidth={1}
                />
                <text
                  x={PADDING.left - 6}
                  y={position + 3}
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px]"
                >
                  {formatLeftTick(value)}
                </text>
              </g>
            );
          })}

          {series.map((entry) => (
            <SeriesShape
              key={entry.key}
              series={entry}
              xs={xs}
              y={y}
              innerWidth={innerWidth}
              count={count}
              baseline={PADDING.top + innerHeight}
            />
          ))}

          {active !== null && xs[active] !== undefined ? (
            <line
              x1={xs[active]}
              x2={xs[active]}
              y1={PADDING.top}
              y2={PADDING.top + innerHeight}
              className="stroke-muted-foreground"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ) : null}

          {activeSeries.map(({ entry, value }) =>
            entry.kind === "bar" ? null : (
              <circle
                key={entry.key}
                cx={xs[active as number]}
                cy={y(value, entry.axis ?? "left")}
                r={4}
                fill={entry.color}
                className="stroke-background"
                strokeWidth={1.5}
              />
            ),
          )}

          {xTicks.map((index) => (
            <text
              key={index}
              x={xs[index]}
              y={height - 4}
              textAnchor={index === 0 ? "start" : index === count - 1 ? "end" : "middle"}
              className="fill-muted-foreground text-[10px]"
            >
              {labels[index]}
            </text>
          ))}
        </svg>
      </div>

      {/*
        The readout sits under the chart rather than floating over it. A tooltip
        that follows a finger on a phone is a tooltip under a finger, and the
        one thing it is covering is the point being asked about.
      */}
      <p
        aria-live="polite"
        className="numeric mt-1 min-h-4 text-[11px] leading-4 text-muted-foreground"
      >
        {readout}
      </p>
    </div>
  );
}

function SeriesShape({
  series,
  xs,
  y,
  innerWidth,
  count,
  baseline,
}: {
  series: MiniChartSeries;
  xs: number[];
  y: (value: number, axis: Axis) => number;
  innerWidth: number;
  count: number;
  baseline: number;
}) {
  const axis = series.axis ?? "left";

  if (series.kind === "bar") {
    const barWidth = Math.max(1, (innerWidth / Math.max(1, count)) * 0.6);
    return (
      <g fill={series.color} fillOpacity={series.opacity ?? 0.25}>
        {series.values.map((value, index) =>
          value === null || xs[index] === undefined ? null : (
            <rect
              key={index}
              x={xs[index] - barWidth / 2}
              y={y(value, axis)}
              width={barWidth}
              height={Math.max(1, baseline - y(value, axis))}
              rx={2}
            />
          ),
        )}
      </g>
    );
  }

  if (series.kind === "dots") {
    return (
      <g fill={series.color}>
        {series.values.map((value, index) =>
          value === null || xs[index] === undefined ? null : (
            <circle key={index} cx={xs[index]} cy={y(value, axis)} r={2} />
          ),
        )}
      </g>
    );
  }

  // A line, broken rather than bridged across a gap. Seven days with no
  // weigh-in has no seven-day average, and a straight line across the hole
  // would invent one.
  const segments: string[] = [];
  let current: string[] = [];

  series.values.forEach((value, index) => {
    if (value === null || xs[index] === undefined) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? "M" : "L"}${xs[index]} ${y(value, axis)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));

  return (
    <>
      {segments.map((path) => (
        <path
          key={path}
          d={path}
          fill="none"
          stroke={series.color}
          strokeWidth={series.width ?? 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {series.showPoints
        ? series.values.map((value, index) =>
            value === null || xs[index] === undefined ? null : (
              <circle key={index} cx={xs[index]} cy={y(value, axis)} r={3} fill={series.color} />
            ),
          )
        : null}
    </>
  );
}
