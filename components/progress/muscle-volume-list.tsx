"use client";

import { formatEffectiveSets, formatTonnage } from "@/lib/format";
import type { MuscleSlug } from "@/lib/muscles";
import { cn } from "@/lib/utils";

import type { HeatmapMuscle } from "./muscle-heatmap";

/**
 * The numbers behind the paint, most-worked first.
 *
 * The heatmap answers "what did I neglect" at a glance; this answers "by how
 * much", which the ramp deliberately cannot because four bands cannot encode
 * eighteen values. Rows are buttons so the list doubles as the keyboard and
 * screen-reader route to selecting a region on the figure.
 */
export function MuscleVolumeList({
  muscles,
  selected,
  onSelect,
}: {
  muscles: HeatmapMuscle[];
  selected: MuscleSlug | null;
  onSelect: (slug: MuscleSlug | null) => void;
}) {
  const ranked = [...muscles].sort(
    (a, b) => b.effectiveSets - a.effectiveSets || a.displayName.localeCompare(b.displayName),
  );
  const most = ranked[0]?.effectiveSets ?? 0;

  return (
    <ul className="flex flex-col">
      {ranked.map((muscle) => {
        const isSelected = muscle.slug === selected;
        // The bar is relative to the hardest-worked muscle in the window, not
        // to a fixed ceiling. It compares regions against each other, which is
        // the question the list is for; the bands already say whether the
        // absolute figure is enough.
        const share = most > 0 ? (muscle.effectiveSets / most) * 100 : 0;

        return (
          <li key={muscle.slug}>
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(isSelected ? null : muscle.slug)}
              className={cn(
                "relative flex min-h-11 w-full items-center justify-between gap-3 border-b px-3 text-left last:border-b-0",
                isSelected && "bg-muted",
              )}
            >
              <span
                aria-hidden
                className="absolute inset-y-1 left-0 rounded-r-[2px] bg-overload/10"
                style={{ width: `${share}%` }}
              />
              <span className="relative text-sm">
                {muscle.displayName}
                {muscle.effectiveSets === 0 ? (
                  <span className="ml-2 text-xs text-muted-foreground">nothing</span>
                ) : null}
              </span>
              <span className="numeric relative shrink-0 text-right text-xs text-muted-foreground">
                <span className="text-foreground">{formatEffectiveSets(muscle.effectiveSets)}</span>{" "}
                sets
                {muscle.tonnage > 0 ? (
                  <span className="block">{formatTonnage(muscle.tonnage)}</span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
