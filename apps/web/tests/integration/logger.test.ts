import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@setwise/db/schema";
import { estimateOneRepMax } from "@setwise/domain/math";
import { overloadDelta } from "@setwise/domain/overload";
import { DEFAULT_BAR_KG, loadBar } from "@setwise/domain/plates";
import { exportSetsCsv } from "@setwise/db/queries/export";
import { recordSetPersonalRecords } from "@setwise/db/queries/prs";
import { createSet, lastPerformances, updateSet } from "@setwise/db/queries/session";
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
      throw new Error("Seed is missing the bench press. Run pnpm db:seed.");
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

  it("reads ghost values for the whole lineup in one query", async () => {
    const ghosts = await lastPerformances(db, userId, [benchId], currentSessionId);
    const previous = ghosts[benchId];

    expect(previous?.sessionId).toBe(previousSessionId);
    expect(previous?.sets.map((set) => [set.weight, set.reps])).toEqual([
      [100, 5],
      [100, 5],
    ]);
  });

  it("reports a never-trained exercise as null rather than omitting it", async () => {
    const ghosts = await lastPerformances(db, userId, [randomUUID()], currentSessionId);
    expect(Object.values(ghosts)).toEqual([null]);
  });

  it("does not create records from a warm-up", async () => {
    const warmup = await createSet(db, userId, {
      id: randomUUID(),
      sessionId: currentSessionId,
      exerciseId: benchId,
      setIndex: 0,
      weight: 60,
      reps: 8,
      rpe: null,
      isWarmup: true,
    });

    expect(warmup.status).toBe("written");
    if (warmup.status !== "written") throw new Error("Expected the warm-up to be written.");
    expect(await recordSetPersonalRecords(db, userId, warmup.set, "created")).toEqual([]);
  });

  it("returns the stored row when the same set id arrives twice", async () => {
    const input = {
      id: randomUUID(),
      sessionId: currentSessionId,
      exerciseId: benchId,
      setIndex: 5,
      weight: 80,
      reps: 6,
      rpe: null,
      isWarmup: false,
    };

    const first = await createSet(db, userId, input);
    const replay = await createSet(db, userId, input);

    expect(first.status).toBe("written");
    expect(replay.status).toBe("replayed");

    const stored = await db.select().from(schema.sets).where(eq(schema.sets.id, input.id));
    expect(stored).toHaveLength(1);

    await db.delete(schema.sets).where(eq(schema.sets.id, input.id));
  });

  it("refuses a reused id that stands for a different set", async () => {
    const input = {
      id: randomUUID(),
      sessionId: currentSessionId,
      exerciseId: benchId,
      setIndex: 6,
      weight: 80,
      reps: 6,
      rpe: null,
      isWarmup: false,
    };

    await createSet(db, userId, input);
    const conflict = await createSet(db, userId, { ...input, reps: 7 });
    expect(conflict.status).toBe("id-conflict");

    await db.delete(schema.sets).where(eq(schema.sets.id, input.id));
  });

  it("keeps one set id, updates that row, and drops stale PRs after an edit", async () => {
    const input = {
      id: randomUUID(),
      sessionId: currentSessionId,
      exerciseId: benchId,
      setIndex: 1,
      weight: 102.5,
      reps: 5,
      rpe: 8,
      isWarmup: false,
    };

    const created = await createSet(db, userId, input);
    if (created.status !== "written") throw new Error("Expected the set to be written.");
    const workingSet = created.set;
    const setId = workingSet.id;
    // The client named it, and the row kept that name.
    expect(setId).toBe(input.id);
    const records = await recordSetPersonalRecords(db, userId, workingSet, "created");
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

    const sessionSets = await db
      .select()
      .from(schema.sets)
      .where(eq(schema.sets.sessionId, currentSessionId));
    expect(sessionSets).toHaveLength(2);
    const update = await updateSet(db, userId, { ...input, weight: 90 });
    if (update.status !== "written") throw new Error("Expected the saved set to exist.");
    const edited = update.set;
    const recordsAfterEdit = await recordSetPersonalRecords(db, userId, edited, "edited");
    expect(recordsAfterEdit.some((record) => record.kind === "max_weight")).toBe(false);

    const storedAfterEdit = await db
      .select()
      .from(schema.personalRecords)
      .where(eq(schema.personalRecords.setId, setId));
    expect(storedAfterEdit.some((record) => record.kind === "max_weight")).toBe(false);

    const afterUpdate = await db
      .select()
      .from(schema.sets)
      .where(eq(schema.sets.sessionId, currentSessionId));
    expect(afterUpdate).toHaveLength(2);
    expect(afterUpdate.find((set) => set.id === setId)?.weight).toBe(90);
    expect(edited.performedAt.getTime()).toBe(workingSet.performedAt.getTime());
  });

  it("exports the stable public columns and confirmed set data", async () => {
    const csv = await exportSetsCsv(db, userId);
    const [header, ...rows] = csv.trim().split("\r\n");

    expect(header).toBe(
      "session_id,session_started_at,session_ended_at,set_id,performed_at,exercise,equipment,set_index,is_warmup,weight_kg,reps,rpe,e1rm_kg",
    );
    const edited = rows.find(
      (row) => row.startsWith(`${currentSessionId},`) && row.includes(",90,"),
    );
    expect(edited).toBeDefined();
    expect(edited?.split(",")).toHaveLength(13);
  });
});
