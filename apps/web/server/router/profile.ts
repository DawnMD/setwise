import { z } from "zod";

import { profilePatch, timeZone } from "@setwise/domain/validators";
import { protectedProcedure } from "../orpc";
import {
  completeOnboarding,
  dismissProfilePrompt,
  profileSummary,
  saveProfile,
} from "@setwise/db/queries/profile";
import "@tanstack/react-start/server-only";

/**
 * The profile and the targets it produces.
 *
 * Every write returns the same summary a read does. The wizard shows a live
 * calorie target as the answers come in, and re-deriving it on the client from
 * a patch response would put a second copy of the formulas in the browser —
 * which is exactly how the two ever start to disagree.
 */
export const profileRouter = {
  get: protectedProcedure
    .input(z.object({ timeZone: timeZone.default("UTC") }))
    .handler(async ({ input, context }) => {
      return profileSummary(context.db, context.userId, input.timeZone);
    }),

  /** One step of the wizard, or one field of the edit sheet. Both are patches. */
  save: protectedProcedure
    .input(z.object({ patch: profilePatch, timeZone: timeZone.default("UTC") }))
    .handler(async ({ input, context }) => {
      await saveProfile(context.db, context.userId, input.patch);
      return profileSummary(context.db, context.userId, input.timeZone);
    }),

  /**
   * Ends the wizard. Called on "Done" and on "Skip for now" alike: someone who
   * declined every question has answered the question of whether they want to
   * be asked, and re-running the wizard at every sign-in would ignore that.
   */
  finishOnboarding: protectedProcedure
    .input(z.object({ timeZone: timeZone.default("UTC") }))
    .handler(async ({ input, context }) => {
      await completeOnboarding(context.db, context.userId);
      return profileSummary(context.db, context.userId, input.timeZone);
    }),

  /** Two weeks. Only the dismissible prompt honours it; Body and Settings do not. */
  dismissPrompt: protectedProcedure
    .input(z.object({ timeZone: timeZone.default("UTC") }))
    .handler(async ({ input, context }) => {
      await dismissProfilePrompt(context.db, context.userId, input.timeZone);
      return profileSummary(context.db, context.userId, input.timeZone);
    }),
};
