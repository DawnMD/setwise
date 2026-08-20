"use client";

import * as React from "react";

import { isMuscleSlug, MUSCLES, type MuscleSlug } from "@/lib/muscles";
import type { VolumeBand } from "@/lib/math";
import { BodyMap } from "@/components/body-map";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type MuscleRole = "primary" | "secondary";

/**
 * Tagging an exercise by tapping the body.
 *
 * The heatmap is the differentiator and it inherits every factor set here, so
 * the tagging screen has to make a wrong tag obvious. Painting the selection
 * onto the same two SVGs the heatmap will use does that: you see the shape of
 * what you claimed before it can quietly under-report a month of training.
 *
 * The map is the fast path, not the only one. Each region also has a chip,
 * because an SVG region is not reachable by keyboard or screen reader and a
 * muscle picker that only works by touch is a muscle picker half the people
 * cannot use.
 *
 * Tapping cycles: untagged → primary → secondary → untagged. One gesture for
 * three states beats a mode switch above the figure.
 */
export function MusclePicker({
  primary,
  secondary,
  onChange,
}: {
  primary: MuscleSlug[];
  secondary: MuscleSlug[];
  onChange: (next: { primary: MuscleSlug[]; secondary: MuscleSlug[] }) => void;
}) {
  const roleOf = React.useCallback(
    (slug: MuscleSlug): MuscleRole | null =>
      primary.includes(slug) ? "primary" : secondary.includes(slug) ? "secondary" : null,
    [primary, secondary],
  );

  const cycle = React.useCallback(
    (slug: MuscleSlug) => {
      const role = roleOf(slug);
      const withoutSlug = {
        primary: primary.filter((entry) => entry !== slug),
        secondary: secondary.filter((entry) => entry !== slug),
      };

      if (role === null) {
        onChange({ ...withoutSlug, primary: [...withoutSlug.primary, slug] });
      } else if (role === "primary") {
        onChange({ ...withoutSlug, secondary: [...withoutSlug.secondary, slug] });
      } else {
        onChange(withoutSlug);
      }
    },
    [onChange, primary, roleOf, secondary],
  );

  /**
   * The body SVG is injected markup, so the click is caught on the way up and
   * traced back to whichever region it came from. Attaching a listener per path
   * would mean rewriting the generated SVG, which is the one thing the body map
   * promises not to do.
   */
  const onMapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const region = (event.target as Element).closest?.("[data-muscle]");
    const slug = region?.getAttribute("data-muscle");
    if (slug && isMuscleSlug(slug)) cycle(slug);
  };

  // Reusing the heatmap's own bands: a primary mover paints at the top of the
  // ramp, a secondary halfway, untagged flat grey. Same visual language as the
  // screen this tagging feeds.
  const bands = React.useMemo(() => {
    const map: Partial<Record<MuscleSlug, VolumeBand>> = {};
    for (const slug of primary) map[slug] = "high";
    for (const slug of secondary) map[slug] = "low";
    return map;
  }, [primary, secondary]);

  const selected = [...primary, ...secondary];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2" onClick={onMapClick}>
        {(["front", "back"] as const).map((view) => (
          <figure key={view} className="rounded-lg border bg-card p-2">
            <BodyMap view={view} bands={bands} className="[&_[data-muscle]]:cursor-pointer" />
            <figcaption className="mt-1 text-center text-xs text-muted-foreground capitalize">
              {view}
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="overload">Primary</Badge>
        <span>counts as a full set</span>
        <Badge variant="secondary">Secondary</Badge>
        <span>counts as half</span>
      </div>

      <ToggleGroup
        variant="outline"
        multiple
        value={selected}
        onValueChange={(next: string[]) => {
          // Base UI hands back the whole selection; the change is whichever
          // slug entered or left it, and that one goes through the same cycle
          // as a tap on the figure.
          const added = next.find((slug) => !selected.includes(slug as MuscleSlug));
          const removed = selected.find((slug) => !next.includes(slug));
          const slug = added ?? removed;
          if (slug && isMuscleSlug(slug)) cycle(slug);
        }}
        aria-label="Muscles trained"
        className="flex-wrap"
      >
        {MUSCLES.map((muscle) => {
          const role = roleOf(muscle.slug);
          return (
            <ToggleGroupItem
              key={muscle.slug}
              value={muscle.slug}
              className="h-9"
              aria-label={`${muscle.displayName}${role ? `, ${role}` : ""}`}
            >
              {muscle.displayName}
              {role === "secondary" ? <span className="text-muted-foreground"> ½</span> : null}
            </ToggleGroupItem>
          );
        })}
      </ToggleGroup>
    </div>
  );
}
