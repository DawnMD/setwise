/**
 * Seeds the muscle list and the global exercise catalogue.
 *
 * Idempotent: muscles upsert on slug, exercises upsert on source id, and each
 * exercise's muscle rows are replaced wholesale. Re-run it after editing
 * `overrides.ts` and the corrections land without touching anyone's training
 * history, because nothing here writes to a user-owned table.
 *
 *   pnpm db:seed
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { and, inArray, isNull, sql } from "drizzle-orm";

import type { Database } from "./index";
import * as schema from "./schema";
import { syncMuscles } from "./sync-muscles";
import { EXERCISE_OVERRIDES, type MovementPattern } from "./exercise-seed/overrides";
import {
  PRIMARY_FACTOR,
  SECONDARY_FACTOR,
  SOURCE_MUSCLE_MAP,
  type SourceMuscleTag,
} from "./exercise-seed/source-map";
import type { MuscleSlug } from "@setwise/domain/muscles";

type SourceExercise = {
  id: string;
  name: string;
  force: string | null;
  level: string | null;
  mechanic: string | null;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  category: string;
};

type Tag = { slug: MuscleSlug; role: "primary" | "secondary"; factor: number };

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Resolves an exercise to muscle credits. A hand-written override wins outright;
 * otherwise the source's own tags are translated through the coarse map.
 *
 * When both lists name the same muscle -- which happens in the source data, e.g.
 * "Clean and Press" lists shoulders twice -- the primary credit wins, so a
 * muscle is never counted twice for one set.
 */
function resolveTags(source: SourceExercise): { tags: Tag[]; pattern: MovementPattern | null } {
  const override = EXERCISE_OVERRIDES[source.id];

  if (override) {
    const byMuscle = new Map<MuscleSlug, Tag>();
    for (const slug of override.secondary) {
      byMuscle.set(slug, { slug, role: "secondary", factor: SECONDARY_FACTOR });
    }
    for (const slug of override.primary) {
      byMuscle.set(slug, { slug, role: "primary", factor: PRIMARY_FACTOR });
    }
    return { tags: [...byMuscle.values()], pattern: override.pattern };
  }

  const byMuscle = new Map<MuscleSlug, Tag>();

  const apply = (tags: string[], role: "primary" | "secondary", roleFactor: number) => {
    for (const raw of tags) {
      const mapped = SOURCE_MUSCLE_MAP[raw as SourceMuscleTag];
      if (!mapped) continue;
      for (const [slug, share] of mapped) {
        const existing = byMuscle.get(slug);
        // A muscle already credited as primary is never demoted.
        if (existing?.role === "primary") continue;
        byMuscle.set(slug, { slug, role, factor: roleFactor * share });
      }
    }
  };

  apply(source.secondaryMuscles, "secondary", SECONDARY_FACTOR);
  apply(source.primaryMuscles, "primary", PRIMARY_FACTOR);

  // Only the source's own isolation flag is trusted here. Guessing a movement
  // pattern from an exercise name produces confident nonsense, so the long tail
  // stays null until someone looks at it.
  const pattern: MovementPattern | null = source.mechanic === "isolation" ? "isolation" : null;

  return { tags: [...byMuscle.values()], pattern };
}

export type SeedDatabaseOptions = {
  sourceFile?: string;
  log?: (message: string) => void;
};

export async function seedDatabase(db: Database, options: SeedDatabaseOptions = {}): Promise<void> {
  const log = options.log ?? (() => undefined);
  // ---------------------------------------------------------------- muscles
  // Already written by the `0002_seed_muscles` migration on a migrated
  // database. Repeated here through the same upsert so a database built with
  // `db:push`, which never runs migrations, gets them too.
  const muscleId = await syncMuscles(db);
  log(`muscles: ${muscleId.size}`);

  // --------------------------------------------------------------- exercises
  const file =
    options.sourceFile ?? fileURLToPath(new URL("../data/free-exercise-db.json", import.meta.url));
  const sources = JSON.parse(await readFile(file, "utf8")) as SourceExercise[];

  // Global names are unique case-insensitively, and the source has a handful
  // of collisions. First one wins; the rest are reported rather than dropped
  // silently.
  const seenNames = new Set<string>();
  const seenSlugs = new Set<string>();
  const skipped: string[] = [];
  const usable: SourceExercise[] = [];

  for (const source of sources) {
    const key = source.name.toLowerCase();
    const slug = slugify(source.name);
    if (seenNames.has(key) || seenSlugs.has(slug)) {
      skipped.push(source.id);
      continue;
    }
    seenNames.add(key);
    seenSlugs.add(slug);
    usable.push(source);
  }

  let overridden = 0;
  let untagged = 0;
  const taggedIds = new Map<string, Tag[]>();

  const values = usable.map((source) => {
    const { tags, pattern } = resolveTags(source);
    if (EXERCISE_OVERRIDES[source.id]) overridden += 1;
    if (tags.length === 0) untagged += 1;
    taggedIds.set(source.id, tags);

    return {
      name: source.name,
      slug: slugify(source.name),
      equipment: source.equipment ?? null,
      movementPattern: pattern,
      mechanic: source.mechanic ?? null,
      category: source.category ?? null,
      instructions: source.instructions ?? [],
      sourceId: source.id,
      ownerId: null,
    };
  });

  const inserted: Array<{ id: string; sourceId: string | null }> = [];
  const CHUNK = 200;
  for (let i = 0; i < values.length; i += CHUNK) {
    const rows = await db
      .insert(schema.exercises)
      .values(values.slice(i, i + CHUNK))
      .onConflictDoUpdate({
        target: schema.exercises.sourceId,
        targetWhere: sql`${schema.exercises.sourceId} is not null`,
        set: {
          name: sql`excluded.name`,
          slug: sql`excluded.slug`,
          equipment: sql`excluded.equipment`,
          movementPattern: sql`excluded.movement_pattern`,
          mechanic: sql`excluded.mechanic`,
          category: sql`excluded.category`,
          instructions: sql`excluded.instructions`,
        },
      })
      .returning({ id: schema.exercises.id, sourceId: schema.exercises.sourceId });
    inserted.push(...rows);
  }

  log(
    `exercises: ${inserted.length} seeded, ${overridden} hand-corrected, ` +
      `${untagged} with no muscle tags, ${skipped.length} skipped as duplicate names`,
  );

  // -------------------------------------------------------- exercise_muscles
  // Replace wholesale rather than upsert, so a correction that *removes* a
  // muscle actually removes it.
  const exerciseIds = inserted.map((row) => row.id);
  for (let i = 0; i < exerciseIds.length; i += CHUNK) {
    await db
      .delete(schema.exerciseMuscles)
      .where(inArray(schema.exerciseMuscles.exerciseId, exerciseIds.slice(i, i + CHUNK)));
  }

  const links = inserted.flatMap((row) => {
    const tags = row.sourceId ? (taggedIds.get(row.sourceId) ?? []) : [];
    return tags.flatMap((tag) => {
      const id = muscleId.get(tag.slug);
      if (id === undefined) return [];
      return [
        {
          exerciseId: row.id,
          muscleId: id,
          role: tag.role,
          factor: tag.factor,
        },
      ];
    });
  });

  for (let i = 0; i < links.length; i += CHUNK) {
    await db.insert(schema.exerciseMuscles).values(links.slice(i, i + CHUNK));
  }
  log(`exercise_muscles: ${links.length} rows`);

  if (skipped.length > 0) {
    log(`skipped duplicates: ${skipped.slice(0, 10).join(", ")}`);
  }

  // A quick integrity read: any global exercise with no muscle at all is
  // invisible to the heatmap, which is worth knowing about now rather than
  // when a week of training goes missing from it.
  const orphaned = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.exercises)
    .where(
      and(
        isNull(schema.exercises.ownerId),
        sql`not exists (select 1 from exercise_muscles em where em.exercise_id = ${schema.exercises.id})`,
      ),
    );
  log(`global exercises with no muscle mapping: ${orphaned[0]?.count ?? 0}`);
}
