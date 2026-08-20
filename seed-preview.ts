import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { createNeonPool } from "./db/neon";
import * as schema from "./db/schema";

const EMAIL = "phase3-preview@example.invalid";

// A push/pull/legs rotation, run twice a week for six weeks, with the top set
// creeping up so the e1RM trend has somewhere to go.
const DAYS: Record<string, [string, number, number, number][]> = {
  push: [
    ["Barbell_Bench_Press_-_Medium_Grip", 80, 5, 4],
    ["Dumbbell_Shoulder_Press", 24, 10, 3],
    ["Triceps_Pushdown", 30, 12, 3],
    ["Side_Lateral_Raise", 10, 15, 3],
  ],
  pull: [
    ["Barbell_Deadlift", 140, 3, 3],
    ["Pullups", 0, 8, 4],
    ["Barbell_Curl", 30, 10, 3],
    ["Bent_Over_Barbell_Row", 70, 8, 3],
  ],
  legs: [
    ["Barbell_Squat", 100, 5, 4],
    ["Romanian_Deadlift", 90, 8, 3],
    ["Leg_Extensions", 50, 12, 3],
  ],
};

async function main() {
  const client = createNeonPool(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL!);
  const db = drizzle({ client, schema });

  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, EMAIL));
  if (!u) throw new Error("preview user not found");
  console.log("user", u.id);

  await db.delete(schema.workoutSessions).where(eq(schema.workoutSessions.userId, u.id));

  const wanted = [
    ...new Set(
      Object.values(DAYS)
        .flat()
        .map(([s]) => s),
    ),
  ];
  const found = await db
    .select({
      id: schema.exercises.id,
      sourceId: schema.exercises.sourceId,
      name: schema.exercises.name,
    })
    .from(schema.exercises)
    .where(inArray(schema.exercises.sourceId, wanted));
  const byS = new Map(found.map((e) => [e.sourceId!, e]));
  const missing = wanted.filter((s) => !byS.has(s));
  if (missing.length) console.log("MISSING (skipped):", missing);

  const order = ["push", "pull", "legs"] as const;
  let sessionCount = 0;
  // Six weeks back to yesterday, three sessions a week.
  for (let week = 5; week >= 0; week -= 1) {
    for (let i = 0; i < 3; i += 1) {
      const day = order[i];
      const age = week * 7 + (5 - i * 2);
      if (age < 1) continue;
      const at = new Date(Date.now() - age * 86_400_000);
      const sessionId = randomUUID();
      await db.insert(schema.workoutSessions).values({
        id: sessionId,
        userId: u.id,
        startedAt: at,
        endedAt: new Date(at.getTime() + 3.6e6),
      });
      sessionCount += 1;

      let idx = 0;
      for (const [src, baseWeight, reps, count] of DAYS[day]) {
        const ex = byS.get(src);
        if (!ex) continue;
        // Creep the top lifts up ~2.5kg a week so the trend line rises.
        const progressed = baseWeight > 0 ? baseWeight + (5 - week) * 2.5 : 0;
        // One warm-up on the first exercise of the day.
        if (idx === 0 && progressed > 0) {
          await db.insert(schema.sets).values({
            id: randomUUID(),
            sessionId,
            exerciseId: ex.id,
            setIndex: idx++,
            weight: Math.round(progressed * 0.6),
            reps: 5,
            isWarmup: true,
            performedAt: at,
            clientCreatedAt: at,
          });
        }
        for (let s = 0; s < count; s += 1) {
          await db.insert(schema.sets).values({
            id: randomUUID(),
            sessionId,
            exerciseId: ex.id,
            setIndex: idx++,
            weight: progressed,
            reps,
            rpe: s === count - 1 ? 8.5 : 7.5,
            isWarmup: false,
            performedAt: at,
            clientCreatedAt: at,
          });
        }
      }
    }
  }
  console.log("sessions:", sessionCount);
  await client.end();
}
main();
