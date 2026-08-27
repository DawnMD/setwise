import { homeSummary } from "@setwise/db/queries/home";
import type { ProcedureImplementers } from "../procedure";

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
export function createHomeRouter(procedure: ProcedureImplementers["protectedApi"]["home"]) {
  return {
    summary: procedure.summary.handler(async ({ input, context }) => {
      return homeSummary(context.db, context.userId, input.timeZone);
    }),
  };
}
