import { z } from "zod";

import { bodyweightLogInput, isoDay, statWindow, timeZone } from "@/db/validators";
import { protectedProcedure } from "../orpc";
import { bodyweightSeries, logBodyweight, removeBodyweight } from "../queries/bodyweight";

const bodyweightProcedure = protectedProcedure.errors({
  LOG_NOT_FOUND: {
    message: "There's no weigh-in on that day.",
  },
});

/**
 * The bodyweight log.
 *
 * One procedure returns the whole chart rather than a series and a summary
 * separately: both are read off the same dense day list, and splitting them
 * would run the rolling average twice to draw one card.
 *
 * Every read takes the same `window` as the stats screen, because the toggle
 * above them governs both and 30 days has to mean 30 days everywhere.
 */
export const bodyweightRouter = {
  series: bodyweightProcedure
    .input(z.object({ window: statWindow.default(7), timeZone: timeZone.default("UTC") }))
    .handler(async ({ input, context }) => {
      const series = await bodyweightSeries(
        context.db,
        context.userId,
        input.window,
        input.timeZone,
      );
      return { window: input.window, ...series };
    }),

  /** Upserts the day. Weighing twice is a correction, not a second reading. */
  log: bodyweightProcedure.input(bodyweightLogInput).handler(async ({ input, context }) => {
    return logBodyweight(context.db, context.userId, input);
  }),

  /**
   * A typed miss rather than a silent success. Someone deleting a row that is
   * already gone has a stale screen, and telling them so is how it gets fixed.
   */
  remove: bodyweightProcedure
    .input(z.object({ loggedOn: isoDay }))
    .handler(async ({ input, context, errors }) => {
      const removed = await removeBodyweight(context.db, context.userId, input.loggedOn);
      if (!removed) throw errors.LOG_NOT_FOUND();
      return { loggedOn: input.loggedOn };
    }),
};
