/**
 * The canonical muscle list. Eighteen regions.
 *
 * This list is load-bearing in three places at once: the `muscles` table rows,
 * the `id` on every path in the body SVGs, and the muscle picker. Adding or
 * renaming a region here means an SVG edit and a new data migration alongside
 * `drizzle/0002_seed_muscles.sql`, which carries a copy of these rows so a
 * migrated database can save a custom exercise without being seeded first.
 * `tests/integration/muscles.test.ts` fails when the two drift. Decide once.
 */

export const MUSCLE_SLUGS = [
  "chest",
  "front_delts",
  "side_delts",
  "rear_delts",
  "biceps",
  "triceps",
  "forearms",
  "lats",
  "traps",
  "upper_back",
  "lower_back",
  "abs",
  "obliques",
  "glutes",
  "quads",
  "hamstrings",
  "adductors",
  "calves",
] as const;

export type MuscleSlug = (typeof MUSCLE_SLUGS)[number];

/** Which body view a region is drawn on. Drives which SVG paints it. */
export type BodySide = "front" | "back" | "both";

export type MuscleDef = {
  slug: MuscleSlug;
  displayName: string;
  bodySide: BodySide;
  /** The `id` attribute on the corresponding path in the body SVGs. */
  svgPathId: string;
};

export const MUSCLES: readonly MuscleDef[] = [
  { slug: "chest", displayName: "Chest", bodySide: "front", svgPathId: "chest" },
  { slug: "front_delts", displayName: "Front delts", bodySide: "front", svgPathId: "front_delts" },
  { slug: "side_delts", displayName: "Side delts", bodySide: "both", svgPathId: "side_delts" },
  { slug: "rear_delts", displayName: "Rear delts", bodySide: "back", svgPathId: "rear_delts" },
  { slug: "biceps", displayName: "Biceps", bodySide: "front", svgPathId: "biceps" },
  { slug: "triceps", displayName: "Triceps", bodySide: "back", svgPathId: "triceps" },
  { slug: "forearms", displayName: "Forearms", bodySide: "both", svgPathId: "forearms" },
  { slug: "lats", displayName: "Lats", bodySide: "back", svgPathId: "lats" },
  { slug: "traps", displayName: "Traps", bodySide: "both", svgPathId: "traps" },
  { slug: "upper_back", displayName: "Upper back", bodySide: "back", svgPathId: "upper_back" },
  { slug: "lower_back", displayName: "Lower back", bodySide: "back", svgPathId: "lower_back" },
  { slug: "abs", displayName: "Abs", bodySide: "front", svgPathId: "abs" },
  { slug: "obliques", displayName: "Obliques", bodySide: "front", svgPathId: "obliques" },
  { slug: "glutes", displayName: "Glutes", bodySide: "back", svgPathId: "glutes" },
  { slug: "quads", displayName: "Quads", bodySide: "front", svgPathId: "quads" },
  { slug: "hamstrings", displayName: "Hamstrings", bodySide: "back", svgPathId: "hamstrings" },
  { slug: "adductors", displayName: "Adductors", bodySide: "front", svgPathId: "adductors" },
  { slug: "calves", displayName: "Calves", bodySide: "both", svgPathId: "calves" },
] as const;

const BY_SLUG = new Map(MUSCLES.map((m) => [m.slug, m]));

export function muscleBySlug(slug: string): MuscleDef | undefined {
  return BY_SLUG.get(slug as MuscleSlug);
}

export function isMuscleSlug(slug: string): slug is MuscleSlug {
  return BY_SLUG.has(slug as MuscleSlug);
}
