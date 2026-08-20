/**
 * Phase 1's acceptance check for everything the logger computes.
 *
 * Two halves. The first is pure: plate loading, UUIDv7, the Epley window and
 * the overload delta all have hand-worked answers below, and none of them need
 * a database. The second walks a real session through the write path and
 * asserts the three things that make it trustworthy:
 *
 *   1. Re-saving a set upserts on the client id, rather than duplicating it.
 *   2. PR detection fires on what a set beats, and reports what it beat.
 *   3. A warm-up sets no records.
 *
 * It creates a throwaway user and deletes it at the end, so it is safe to run
 * against the real database.
 *
 *   npm run db:verify:logging
 */
import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { parseConnectionString } from "../db/connection";
import * as schema from "../db/schema";
import { estimateOneRepMax } from "../lib/math";
import { overloadDelta } from "../lib/overload";
import { DEFAULT_BAR_KG, loadBar } from "../lib/plates";
import { uuidv7, uuidv7Timestamp } from "../lib/uuid";
import { recordSetPersonalRecords } from "../server/queries/prs";
import { lastPerformance, upsertSet } from "../server/queries/session";

config({ path: ".env.local", quiet: true });

const failures: string[] = [];

function check(label: string, condition: boolean, detail?: string) {
  if (!condition) failures.push(detail ? `${label}: ${detail}` : label);
}

function expectEqual(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) failures.push(`${label}: expected ${b}, got ${a}`);
}

function expectClose(label: string, actual: number, expected: number) {
  if (Math.abs(actual - expected) > 1e-6) {
    failures.push(`${label}: expected ${expected}, got ${actual}`);
  }
}

/** `[target kg, plates per side, remainder kg]`, worked out by hand. */
const LOADINGS: Array<[number, number[], number]> = [
  // A 20 kg bar with nothing on it.
  [20, [], 0],
  // 100 = 20 + 2 x (25 + 15)
  [100, [25, 15], 0],
  // 142.5 = 20 + 2 x (25 + 25 + 10 + 1.25)
  [142.5, [25, 25, 10, 1.25], 0],
  // 62.5 = 20 + 2 x (20 + 1.25)  -> greedy takes 20 then 1.25
  [62.5, [20, 1.25], 0],
  // The change plates: 25 = 20 + 2 x 2.5, and 24 = 20 + 2 x 2.
  [25, [2.5], 0],
  [24, [2], 0],
  // 23.5 wants 1.75 a side. The 1.5 goes on and the last quarter-kilo does not
  // exist, so it is reported short rather than rounded away.
  [23.5, [1.5], 0.5],
  // Nothing in the set makes 0.1 per side, so a tenth of a kilo goes unmade.
  [20.2, [], 0.2],
];

function verifyPure() {
  for (const [target, expected, remainder] of LOADINGS) {
    const loading = loadBar(target, DEFAULT_BAR_KG);
    if (!loading) {
      failures.push(`plates ${target}: got null`);
      continue;
    }
    expectEqual(
      `plates ${target} per side`,
      loading.perSide.map((plate) => plate.kg),
      expected,
    );
    expectClose(`plates ${target} remainder`, loading.remainderKg, remainder);
    // The loading has to add back up, or the strip is decorative.
    const total = DEFAULT_BAR_KG + 2 * loading.perSide.reduce((sum, p) => sum + p.kg, 0);
    expectClose(`plates ${target} sums back`, total, target - remainder);
  }

  check("a load under the bar is refused", loadBar(15, 20) === null);

  // Epley, and the twelve-rep ceiling it stops being trustworthy above.
  expectClose("e1rm 100x5", estimateOneRepMax(100, 5)!, 100 * (1 + 5 / 30));
  check("e1rm above 12 reps is null", estimateOneRepMax(100, 13) === null);
  check("e1rm at exactly 12 reps is a number", estimateOneRepMax(100, 12) !== null);
  check("e1rm of a bodyweight set is null", estimateOneRepMax(0, 8) === null);

  // The delta is strict: more weight, or the same weight for more reps.
  const ghost = { weight: 100, reps: 8, rpe: null };
  expectEqual("overload +2.5 kg", overloadDelta({ weight: 102.5, reps: 5 }, ghost), {
    kind: "weight",
    delta: 2.5,
  });
  expectEqual("overload +1 rep", overloadDelta({ weight: 100, reps: 9 }, ghost), {
    kind: "reps",
    delta: 1,
  });
  check(
    "matching last time is not overload",
    overloadDelta({ weight: 100, reps: 8 }, ghost) === null,
  );
  check(
    "less weight for more reps is a trade, not a win",
    overloadDelta({ weight: 95, reps: 12 }, ghost) === null,
  );
  check("no ghost means no delta", overloadDelta({ weight: 200, reps: 20 }, null) === null);

  // UUIDv7: correct version and variant bits, and sortable by mint time.
  const ids = Array.from({ length: 500 }, () => uuidv7());
  const shape = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  check("uuidv7 shape, version and variant", ids.every((id) => shape.test(id)));
  check("uuidv7 ids are unique", new Set(ids).size === ids.length);
  check("uuidv7 ids sort by creation order", ids.every((id, i) => i === 0 || ids[i - 1] < id));

  const before = Date.now();
  const stamped = uuidv7Timestamp(uuidv7());
  check(
    "uuidv7 carries its timestamp",
    stamped !== null && stamped >= before - 1 && stamped <= Date.now() + 1,
    `got ${stamped}`,
  );
}

async function main() {
  verifyPure();

  const raw = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!raw) throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL in .env.local");

  const { url, ssl } = parseConnectionString(raw);
  const client = postgres(url, { ssl, max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  const userId = `verify-log-${randomUUID()}`;

  try {
    await db.insert(schema.user).values({
      id: userId,
      name: "Logger fixture",
      email: `${userId}@example.invalid`,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const [bench] = await db
      .select({ id: schema.exercises.id })
      .from(schema.exercises)
      .where(eq(schema.exercises.sourceId, "Barbell_Bench_Press_-_Medium_Grip"))
      .limit(1);
    if (!bench) throw new Error("Seed is missing the bench press. Run npm run db:seed.");

    // --- Last week: 100 kg x 5, twice. This becomes the ghost value. ---
    const lastWeek = randomUUID();
    const lastWeekAt = new Date(Date.now() - 7 * 86_400_000);
    await db.insert(schema.workoutSessions).values({
      id: lastWeek,
      userId,
      startedAt: lastWeekAt,
      endedAt: lastWeekAt,
    });
    for (let i = 0; i < 2; i += 1) {
      await db.insert(schema.sets).values({
        id: randomUUID(),
        sessionId: lastWeek,
        exerciseId: bench.id,
        setIndex: i,
        weight: 100,
        reps: 5,
        isWarmup: false,
        performedAt: lastWeekAt,
        clientCreatedAt: lastWeekAt,
      });
    }

    // --- Today ---
    const today = randomUUID();
    await db.insert(schema.workoutSessions).values({ id: today, userId });

    const ghost = await lastPerformance(db, userId, bench.id, today);
    check("the ghost comes from the previous session", ghost?.sessionId === lastWeek);
    expectEqual(
      "the ghost is last session's sets",
      ghost?.sets.map((set) => [set.weight, set.reps]),
      [
        [100, 5],
        [100, 5],
      ],
    );

    const warmupId = uuidv7();
    const warmup = await upsertSet(db, {
      id: warmupId,
      sessionId: today,
      exerciseId: bench.id,
      setIndex: 0,
      weight: 60,
      reps: 8,
      rpe: null,
      isWarmup: true,
      clientCreatedAt: new Date(),
    });
    const warmupRecords = await recordSetPersonalRecords(db, userId, warmup);
    expectEqual("a warm-up sets no records", warmupRecords, []);

    // 102.5 x 5 beats last week's 100 x 5 on weight and on e1RM, and it is the
    // first time this weight has been touched, so reps-at-weight is a first.
    const workingId = uuidv7();
    const working = await upsertSet(db, {
      id: workingId,
      sessionId: today,
      exerciseId: bench.id,
      setIndex: 1,
      weight: 102.5,
      reps: 5,
      rpe: 8,
      isWarmup: false,
      clientCreatedAt: new Date(),
    });
    const records = await recordSetPersonalRecords(db, userId, working);
    const byKind = new Map(records.map((record) => [record.kind, record]));

    expectClose("max weight PR value", byKind.get("max_weight")?.value ?? 0, 102.5);
    expectClose("max weight PR beat 100", byKind.get("max_weight")?.previous ?? 0, 100);
    expectClose(
      "best e1rm PR value",
      byKind.get("best_e1rm")?.value ?? 0,
      estimateOneRepMax(102.5, 5)!,
    );
    expectClose(
      "best e1rm PR beat last week's",
      byKind.get("best_e1rm")?.previous ?? 0,
      estimateOneRepMax(100, 5)!,
    );
    check(
      "first reps at a new weight is a record with nothing behind it",
      byKind.get("max_reps_at_weight")?.previous === null,
    );

    const stored = await db
      .select()
      .from(schema.personalRecords)
      .where(eq(schema.personalRecords.setId, workingId));
    expectEqual("records are written once", stored.length, records.length);

    // --- The retry. Same id, same payload: an upsert, not a second set. ---
    const retried = await upsertSet(db, {
      id: workingId,
      sessionId: today,
      exerciseId: bench.id,
      setIndex: 1,
      weight: 102.5,
      reps: 5,
      rpe: 8,
      isWarmup: false,
      clientCreatedAt: new Date(),
    });
    await recordSetPersonalRecords(db, userId, retried);

    const rows = await db
      .select()
      .from(schema.sets)
      .where(eq(schema.sets.sessionId, today));
    expectEqual("a retry does not duplicate the set", rows.length, 2);
    expectEqual(
      "a retry keeps the original performedAt",
      retried.performedAt.getTime(),
      working.performedAt.getTime(),
    );

    const afterRetry = await db
      .select()
      .from(schema.personalRecords)
      .where(eq(schema.personalRecords.setId, workingId));
    expectEqual("a retry does not duplicate the records", afterRetry.length, stored.length);

    // --- An edit that lowers the weight is no longer a PR. ---
    const edited = await upsertSet(db, {
      id: workingId,
      sessionId: today,
      exerciseId: bench.id,
      setIndex: 1,
      weight: 90,
      reps: 5,
      rpe: 8,
      isWarmup: false,
      clientCreatedAt: new Date(),
    });
    const afterEdit = await recordSetPersonalRecords(db, userId, edited);
    check(
      "correcting a set down drops its weight PR",
      !afterEdit.some((record) => record.kind === "max_weight"),
    );

    if (failures.length > 0) {
      console.error(`${failures.length} check(s) failed:`);
      for (const failure of failures) console.error(`  ${failure}`);
      process.exitCode = 1;
    } else {
      console.log("Plate maths, UUIDv7, e1RM, overload deltas, upserts and PR detection all pass.");
    }
  } finally {
    // Cascades to both sessions, their sets and their personal records.
    await db.delete(schema.user).where(eq(schema.user.id, userId));
    await client.end();
  }
}

void main();
