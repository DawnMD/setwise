import { z } from "zod";

import { timeZone } from "@setwise/domain/validators";
import { protectedProcedure } from "../orpc";
import { homeSummary } from "@setwise/db/queries/home";
import "@tanstack/react-start/server-only";

/**
 * One procedure, because Home is one question.
 *
 * The screen was never going to be six cards fetching for themselves. Everything
 * on it is read once, together, and nothing on it is editable — a number that
 * wants changing is a link to the screen that owns it.
 *
 * The zone is the caller's. Rest is one per local day and the weight trend is
 * bucketed by date, and neither is answerable in UTC for anyone who trains in
 * the evening.
 */
export const homeRouter = {
  summary: protectedProcedure
    .input(z.object({ timeZone: timeZone.default("UTC") }))
    .handler(async ({ input, context }) => {
      return homeSummary(context.db, context.userId, input.timeZone);
    }),
};
