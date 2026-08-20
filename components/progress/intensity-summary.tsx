"use client";

import { formatPercent, formatRpe } from "@/lib/format";

export type IntensitySummaryData = {
  avgRelativeIntensity: number | null;
  intensitySets: number;
  avgRpe: number | null;
  rpeSets: number;
  workingSets: number;
};

/**
 * Average %e1RM and average RPE, side by side and never blended into one
 * number.
 *
 * They measure different things. One is the load you put on the bar against
 * your own recent best; the other is what the set felt like. The case worth
 * seeing is the two disagreeing — 90% at RPE 7 is a good week, 75% at RPE 9.5
 * is a warning — and an averaged "intensity score" would erase exactly that.
 *
 * Each number carries the count it was taken over, because most sets never get
 * an RPE and a mean of three of them should not be read as a trend.
 */
export function IntensitySummary({ data }: { data: IntensitySummaryData }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Stat
        label="Avg %e1RM"
        value={formatPercent(data.avgRelativeIntensity)}
        footnote={
          data.avgRelativeIntensity === null
            ? "No set in range of an estimate"
            : `over ${data.intensitySets} of ${data.workingSets} sets`
        }
      />
      <Stat
        label="Avg RPE"
        value={formatRpe(data.avgRpe)}
        footnote={
          data.avgRpe === null
            ? "No RPE logged"
            : `over ${data.rpeSets} of ${data.workingSets} sets`
        }
      />
    </div>
  );
}

function Stat({ label, value, footnote }: { label: string; value: string; footnote: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border bg-card px-3 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="numeric-display text-2xl">{value}</span>
      <span className="text-[11px] leading-tight text-muted-foreground">{footnote}</span>
    </div>
  );
}
