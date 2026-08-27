import { describe, expect, it } from "vitest";

import { workoutSessionSchema } from "../src";

describe("API date and null representation", () => {
  it("keeps instants as Date values and nullable fields as explicit nulls", () => {
    const startedAt = new Date("2026-08-28T00:00:00.000Z");
    const result = workoutSessionSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      userId: "user-1",
      routineDayId: null,
      kind: "workout",
      startedAt,
      endedAt: null,
      notes: null,
    });

    expect(result.startedAt).toBe(startedAt);
    expect(result.endedAt).toBeNull();
    expect(result.routineDayId).toBeNull();
  });
});
