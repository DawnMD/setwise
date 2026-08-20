import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "../../db/schema";
import { estimateOneRepMax } from "../../lib/math";
import { overloadDelta } from "../../lib/overload";
import { DEFAULT_BAR_KG, loadBar } from "../../lib/plates";
import { uuidv7, uuidv7Timestamp } from "../../lib/uuid";
import { recordSetPersonalRecords } from "../../server/queries/prs";
import { lastPerformance, upsertSet } from "../../server/queries/session";
import { openTestDatabase } from "./database";

const { client, db } = openTestDatabase();
const userId = `test-logger-${randomUUID()}`;

const LOADINGS: Array<[target: number, platesPerSide: number[], remainder: number]> = [
  [20, [], 0],
  [100, [25, 15], 0],
  [142.5, [25, 25, 10, 1.25], 0],
  [62.5, [20, 1.25], 0],
  [25, [2.5], 0],
  [24, [2], 0],
  [23.5, [1.5], 0.5],
  [20.2, [], 0.2],
];

describe("logger acceptance", () => {
  let benchId: string;
  let previousSessionId: string;
  let currentSessionId: string;

  beforeAll(async () => {
    await db.insert(schema.user).values({
      id: userId,
      name: "Logger test fixture",
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
    if (!bench) {
      throw new Error("Seed is missing the bench press. Run npm run db:seed.");
    }
    benchId = bench.id;

    previousSessionId = randomUUID();
    const previousSessionAt = new Date(Date.now() - 7 * 86_400_000);
    await db.insert(schema.workoutSessions).values({
      id: previousSessionId,
      userId,
      startedAt: previousSessionAt,
      endedAt: previousSessionAt,
    });

    await db.insert(schema.sets).values(
      [0, 1].map((setIndex) => ({
        id: randomUUID(),
        sessionId: previousSessionId,
        exerciseId: benchId,
        setIndex,
        weight: 100,
        reps: 5,
        isWarmup: false,
        performedAt: previousSessionAt,
        clientCreatedAt: previousSessionAt,
      })),
    );

    currentSessionId = randomUUID();
    await db.insert(schema.workoutSessions).values({ id: currentSessionId, userId });
  });

  afterAll(async () => {
    await db.delete(schema.user).where(eq(schema.user.id, userId));
    await client.end();
  });

  it.each(LOADINGS)(
    "loads %d kg with the expected plates and remainder",
    (target, expectedPlates, expectedRemainder) => {
      const loading = loadBar(target, DEFAULT_BAR_KG);

      expect(loading).not.toBeNull();
      expect(loading?.perSide.map((plate) => plate.kg)).toEqual(expectedPlates);
      expect(loading?.remainderKg).toBeCloseTo(expectedRemainder);

      const loadedWeight =
        DEFAULT_BAR_KG + 2 * (loading?.perSide.reduce((sum, plate) => sum + plate.kg, 0) ?? 0);
      expect(loadedWeight).toBeCloseTo(target - expectedRemainder);
    },
  );

  it("refuses a target lighter than the bar", () => {
    expect(loadBar(15, 20)).toBeNull();
  });

  it("uses Epley only for weighted sets up to twelve reps", () => {
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(100 * (1 + 5 / 30));
    expect(estimateOneRepMax(100, 12)).not.toBeNull();
    expect(estimateOneRepMax(100, 13)).toBeNull();
    expect(estimateOneRepMax(0, 8)).toBeNull();
  });

  it("reports only strict weight or rep overload", () => {
    const previous = { weight: 100, reps: 8, rpe: null };

    expect(overloadDelta({ weight: 102.5, reps: 5 }, previous)).toEqual({
      kind: "weight",
      delta: 2.5,
    });
    expect(overloadDelta({ weight: 100, reps: 9 }, previous)).toEqual({
      kind: "reps",
      delta: 1,
    });
    expect(overloadDelta({ weight: 100, reps: 8 }, previous)).toBeNull();
    expect(overloadDelta({ weight: 95, reps: 12 }, previous)).toBeNull();
    expect(overloadDelta({ weight: 200, reps: 20 }, null)).toBeNull();
  });

  it("mints sortable UUIDv7 ids with their creation timestamp", () => {
    const before = Date.now();
    const ids = Array.from({ length: 500 }, () => uuidv7());
    const after = Date.now();
    const shape = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    expect(ids.every((id) => shape.test(id))).toBe(true);
    expect(new Set(ids)).toHaveLength(ids.length);
    expect([...ids].sort()).toEqual(ids);

    const timestamp = uuidv7Timestamp(ids.at(-1)!);
    expect(timestamp).not.toBeNull();
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it("reads ghost values from the previous session", async () => {
    const previous = await lastPerformance(db, userId, benchId, currentSessionId);

    expect(previous?.sessionId).toBe(previousSessionId);
    expect(previous?.sets.map((set) => [set.weight, set.reps])).toEqual([
      [100, 5],
      [100, 5],
    ]);
  });

  it("does not create records from a warm-up", async () => {
    const warmup = await upsertSet(db, {
      id: uuidv7(),
      sessionId: currentSessionId,
      exerciseId: benchId,
      setIndex: 0,
      weight: 60,
      reps: 8,
      rpe: null,
      isWarmup: true,
      clientCreatedAt: new Date(),
    });

    expect(await recordSetPersonalRecords(db, userId, warmup)).toEqual([]);
  });

  it("records PRs once, keeps retries idempotent, and drops stale PRs after an edit", async () => {
    const setId = uuidv7();
    const input = {
      id: setId,
      sessionId: currentSessionId,
      exerciseId: benchId,
      setIndex: 1,
      weight: 102.5,
      reps: 5,
      rpe: 8,
      isWarmup: false,
      clientCreatedAt: new Date(),
    };

    const workingSet = await upsertSet(db, input);
    const records = await recordSetPersonalRecords(db, userId, workingSet);
    const byKind = new Map(records.map((record) => [record.kind, record]));

    expect(byKind.get("max_weight")?.value).toBeCloseTo(102.5);
    expect(byKind.get("max_weight")?.previous).toBeCloseTo(100);
    expect(byKind.get("best_e1rm")?.value).toBeCloseTo(estimateOneRepMax(102.5, 5)!);
    expect(byKind.get("best_e1rm")?.previous).toBeCloseTo(estimateOneRepMax(100, 5)!);
    expect(byKind.get("max_reps_at_weight")?.previous).toBeNull();

    const initiallyStored = await db
      .select()
      .from(schema.personalRecords)
      .where(eq(schema.personalRecords.setId, setId));
    expect(initiallyStored).toHaveLength(records.length);

    const retried = await upsertSet(db, input);
    await recordSetPersonalRecords(db, userId, retried);

    const sessionSets = await db
      .select()
      .from(schema.sets)
      .where(eq(schema.sets.sessionId, currentSessionId));
    expect(sessionSets).toHaveLength(2);
    expect(retried.performedAt.getTime()).toBe(workingSet.performedAt.getTime());

    const recordsAfterRetry = await db
      .select()
      .from(schema.personalRecords)
      .where(eq(schema.personalRecords.setId, setId));
    expect(recordsAfterRetry).toHaveLength(initiallyStored.length);

    const edited = await upsertSet(db, { ...input, weight: 90 });
    const recordsAfterEdit = await recordSetPersonalRecords(db, userId, edited);
    expect(recordsAfterEdit.some((record) => record.kind === "max_weight")).toBe(false);

    const storedAfterEdit = await db
      .select()
      .from(schema.personalRecords)
      .where(eq(schema.personalRecords.setId, setId));
    expect(storedAfterEdit.some((record) => record.kind === "max_weight")).toBe(false);
  });
});
