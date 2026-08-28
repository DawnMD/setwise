import { z } from "zod";

import { timeZone } from "@setwise/domain/validators";
import { isoDaySchema, muscleSlugSchema, startableDaySchema, timestampSchema } from "./dto";
import { protectedContract } from "./shared";

export const homeSummarySchema = z.object({
  active: z.object({ id: z.uuid(), startedAt: timestampSchema }).nullable(),
  nextDay: startableDaySchema.nullable(),
  restLoggedToday: z.boolean(),
  week: z.object({
    days: z.number().int(),
    workingSets: z.number().int(),
    tonnage: z.number(),
    sessions: z.number().int(),
    untrained: z.array(z.object({ slug: muscleSlugSchema, displayName: z.string() })),
  }),
  weight: z.object({
    trend: z.number().nullable(),
    previousTrend: z.number().nullable(),
    changeKg: z.number().nullable(),
    latest: z.object({ day: isoDaySchema, weight: z.number() }).nullable(),
  }),
});

export type HomeSummaryDto = z.infer<typeof homeSummarySchema>;

export const homeContract = {
  summary: protectedContract
    .input(z.object({ timeZone: timeZone.default("UTC") }))
    .output(homeSummarySchema),
};
