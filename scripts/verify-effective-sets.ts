/**
 * Phase 0's acceptance check: insert a known week of training, ask the database
 * for effective sets, and compare against numbers worked out by hand below.
 *
 * This is the check that catches the failure mode the plan warns about, where
 * the heatmap quietly inherits a tagging error. It asserts four things:
 *
 *   1. Effective sets are the sum of per-muscle factors, not a set count.
 *   2. Warm-up sets contribute nothing.
 *   3. The trailing window actually excludes older work.
 *   4. Tonnage weights by the same factor as effective sets.
 *
 * It creates a throwaway user and deletes it at the end, so it is safe to run
 * against the real database.
 *
 *   npm run db:verify
 */
import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { parseConnectionString } from "../db/connection";
import * as schema from "../db/schema";
import type { MuscleSlug } from "../lib/muscles";
import { muscleVolume } from "../server/queries/stats";

config({ path: ".env.local", quiet: true });

const days = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

/**
 * The week, written the way you would say it out loud.
 * `[source id, weight kg, reps, sets, days ago, warm-up?]`
 */
const WEEK: Array<[string, number, number, number, number, boolean]> = [
  ["Barbell_Squat", 60, 5, 1, 3, true],
  ["Barbell_Squat", 100, 5, 3, 3, false],
  ["Barbell_Bench_Press_-_Medium_Grip", 80, 5, 3, 2, false],
  ["Barbell_Deadlift", 140, 3, 2, 1, false],
  ["Side_Lateral_Raise", 10, 15, 3, 1, false],
  // Outside a 7-day window, inside a 90-day one.
  ["Barbell_Curl", 30, 10, 3, 40, false],
];

/**
 * Worked out by hand from the tagging in `overrides.ts`.
 *
 *   Squat      3 working sets. quads/glutes primary, hamstrings/adductors/
 *              lower_back/abs secondary  -> 3.0 each primary, 1.5 each secondary
 *   Bench      3 sets. chest primary, front_delts/triceps secondary
 *              -> chest 3.0, front_delts 1.5, triceps 1.5
 *   Deadlift   2 sets. hamstrings/glutes primary, lower_back/quads/traps/
 *              upper_back/forearms/lats secondary -> 2.0 primary, 1.0 secondary
 *   Laterals   3 sets. side_delts primary only -> 3.0
 *
 * The warm-up squat and the curls from 40 days ago contribute nothing here.
 */
const EXPECTED_SETS_7D: Partial<Record<MuscleSlug, number>> = {
  quads: 3.0 + 1.0,
  glutes: 3.0 + 2.0,
  hamstrings: 1.5 + 2.0,
  adductors: 1.5,
  lower_back: 1.5 + 1.0,
  abs: 1.5,
  chest: 3.0,
  front_delts: 1.5,
  triceps: 1.5,
  side_delts: 3.0,
  traps: 1.0,
  upper_back: 1.0,
  forearms: 1.0,
  lats: 1.0,
  biceps: 0,
  rear_delts: 0,
  obliques: 0,
  calves: 0,
};

/**
 * Tonnage is weight * reps * factor.
 *   Squat 3x100x5 = 1500 at factor 1.0, 750 at 0.5
 *   Bench 3x80x5  = 1200 at factor 1.0, 600 at 0.5
 *   Dead  2x140x3 =  840 at factor 1.0, 420 at 0.5
 *   Lat raise 3x10x15 = 450
 */
const EXPECTED_TONNAGE_7D: Partial<Record<MuscleSlug, number>> = {
  quads: 1500 + 420,
  glutes: 1500 + 840,
  hamstrings: 750 + 840,
  lower_back: 750 + 420,
  adductors: 750,
  abs: 750,
  chest: 1200,
  front_delts: 600,
  triceps: 600,
  side_delts: 450,
};

/** Curls land inside the 90-day window: biceps primary, forearms secondary. */
const EXPECTED_SETS_90D: Partial<Record<MuscleSlug, number>> = {
  biceps: 3.0,
  forearms: 1.0 + 1.5,
};

const failures: string[] = [];

function expectClose(label: string, actual: number, expected: number) {
  if (Math.abs(actual - expected) > 1e-6) {
    failures.push(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function main() {
  const raw = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!raw) throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL in .env.local");

  const { url, ssl } = parseConnectionString(raw);
  const client = postgres(url, { ssl, max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  const userId = `verify-${randomUUID()}`;

  try {
    await db.insert(schema.user).values({
      id: userId,
      name: "Effective sets fixture",
      email: `${userId}@example.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const catalogue = await db
      .select({ id: schema.exercises.id, sourceId: schema.exercises.sourceId })
      .from(schema.exercises);
    const bySourceId = new Map(catalogue.map((e) => [e.sourceId, e.id]));

    const sessionId = randomUUID();
    await db.insert(schema.workoutSessions).values({
      id: sessionId,
      userId,
      startedAt: days(3),
      endedAt: days(3),
    });

    let setIndex = 0;
    for (const [sourceId, weight, reps, count, daysAgo, isWarmup] of WEEK) {
      const exerciseId = bySourceId.get(sourceId);
      if (!exerciseId) throw new Error(`Seed is missing exercise ${sourceId}. Run npm run db:seed.`);

      for (let i = 0; i < count; i += 1) {
        await db.insert(schema.sets).values({
          id: randomUUID(),
          sessionId,
          exerciseId,
          setIndex: setIndex++,
          weight,
          reps,
          isWarmup,
          performedAt: days(daysAgo),
          clientCreatedAt: days(daysAgo),
        });
      }
    }

    const week = await muscleVolume(db, userId, 7);
    const quarter = await muscleVolume(db, userId, 90);

    const weekBySlug = new Map(week.map((m) => [m.slug, m]));
    const quarterBySlug = new Map(quarter.map((m) => [m.slug, m]));

    if (week.length !== 18) {
      failures.push(`expected all 18 muscles in the result, got ${week.length}`);
    }

    for (const [slug, expected] of Object.entries(EXPECTED_SETS_7D)) {
      const row = weekBySlug.get(slug as MuscleSlug);
      if (!row) {
        failures.push(`7d: ${slug} missing from result`);
        continue;
      }
      expectClose(`7d effective sets ${slug}`, row.effectiveSets, expected);
    }

    for (const [slug, expected] of Object.entries(EXPECTED_TONNAGE_7D)) {
      const row = weekBySlug.get(slug as MuscleSlug);
      if (!row) continue;
      expectClose(`7d tonnage ${slug}`, row.tonnage, expected);
    }

    for (const [slug, expected] of Object.entries(EXPECTED_SETS_90D)) {
      const row = quarterBySlug.get(slug as MuscleSlug);
      if (!row) {
        failures.push(`90d: ${slug} missing from result`);
        continue;
      }
      expectClose(`90d effective sets ${slug}`, row.effectiveSets, expected);
    }

    console.log("7-day window, effective sets:");
    for (const m of week) {
      const bar = "#".repeat(Math.round(m.effectiveSets));
      console.log(
        `  ${m.slug.padEnd(12)} ${m.effectiveSets.toFixed(1).padStart(5)}  ` +
          `${m.band.padEnd(11)} ${bar}`,
      );
    }

    if (failures.length > 0) {
      console.error(`\n${failures.length} check(s) failed:`);
      for (const f of failures) console.error(`  ${f}`);
      process.exitCode = 1;
    } else {
      console.log("\nAll effective-set, tonnage, warm-up and window checks passed.");
    }
  } finally {
    // Cascades to the session and its sets.
    await db.delete(schema.user).where(eq(schema.user.id, userId));
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
