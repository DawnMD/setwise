"use client";

import * as React from "react";

import { formatEffectiveSets, formatTonnage } from "@/lib/format";
import type { VolumeBand } from "@/lib/math";
import { isMuscleSlug, type MuscleSlug } from "@/lib/muscles";
import { BodyMap } from "@/components/body-map";

export type HeatmapMuscle = {
  slug: MuscleSlug;
  displayName: string;
  effectiveSets: number;
  weeklyEffectiveSets: number;
  tonnage: number;
  band: VolumeBand;
};

/** The ramp, described in the words the bands are actually defined in. */
const LEGEND: { band: VolumeBand; label: string }[] = [
  { band: "none", label: "None" },
  { band: "low", label: "Under 10" },
  { band: "productive", label: "10 to 19" },
  { band: "high", label: "20+" },
];

const BAND_SWATCH: Record<VolumeBand, string> = {
  none: "var(--band-none)",
  low: "var(--band-low)",
  productive: "var(--band-productive)",
  high: "var(--band-high)",
};

/**
 * The two body views, painted by weekly effective sets.
 *
 * Tap a region to read its numbers. There is no hover on a phone, so the
 * figures cannot carry their values in a tooltip, and printing eighteen labels
 * onto a 390px-wide silhouette is unreadable. One tap, one readout underneath.
 *
 * The regions are not the only way in. An SVG path is not reachable by keyboard
 * or screen reader, so the volume list below is the accessible path to the same
 * selection, and both drive the same state.
 */
export function MuscleHeatmap({
  muscles,
  selected,
  onSelect,
}: {
  muscles: HeatmapMuscle[];
  selected: MuscleSlug | null;
  onSelect: (slug: MuscleSlug | null) => void;
}) {
  const bands = React.useMemo(() => {
    const map: Partial<Record<MuscleSlug, VolumeBand>> = {};
    for (const muscle of muscles) map[muscle.slug] = muscle.band;
    return map;
  }, [muscles]);

  const active = muscles.find((muscle) => muscle.slug === selected) ?? null;

  /**
   * The SVG is injected markup, so the tap is caught on the way up and traced
   * back to whichever region it came from. Attaching a listener per path would
   * mean rewriting the generated SVG, which is the one thing `BodyMap`
   * promises not to do.
   */
  const onMapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const region = (event.target as Element).closest?.("[data-muscle]");
    const slug = region?.getAttribute("data-muscle");
    if (!slug || !isMuscleSlug(slug)) return;
    onSelect(slug === selected ? null : slug);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2" onClick={onMapClick}>
        {(["front", "back"] as const).map((view) => (
          <figure key={view} className="rounded-lg border bg-card p-2">
            <BodyMap
              view={view}
              bands={bands}
              outlined={selected}
              className="[&_[data-muscle]]:cursor-pointer"
            />
            <figcaption className="mt-1 text-center text-xs text-muted-foreground capitalize">
              {view}
            </figcaption>
          </figure>
        ))}
      </div>

      <div
        aria-live="polite"
        className="flex min-h-11 items-center rounded-lg border bg-card px-3 py-2"
      >
        {active ? (
          <div className="flex w-full items-baseline justify-between gap-2">
            <span className="text-sm font-medium">{active.displayName}</span>
            <span className="numeric text-xs text-muted-foreground">
              <span className="text-foreground">
                {formatEffectiveSets(active.effectiveSets)} sets
              </span>{" "}
              · {formatEffectiveSets(active.weeklyEffectiveSets)}/wk ·{" "}
              {formatTonnage(active.tonnage)}
            </span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            Tap a muscle to read its volume for this window.
          </span>
        )}
      </div>

      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {LEGEND.map((entry) => (
          <li key={entry.band} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className="size-3 rounded-[2px] ring-1 ring-foreground/10"
              style={{ backgroundColor: BAND_SWATCH[entry.band] }}
            />
            {entry.label}
          </li>
        ))}
        <li className="text-xs text-muted-foreground">effective sets per week</li>
      </ul>
    </div>
  );
}
