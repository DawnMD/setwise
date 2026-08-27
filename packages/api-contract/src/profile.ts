import { z } from "zod";

import { profilePatch, timeZone } from "@setwise/domain/validators";
import { profileSummarySchema } from "./dto";
import { protectedContract } from "./shared";

const summaryInput = z.object({ timeZone: timeZone.default("UTC") });

export const profileContract = {
  get: protectedContract.input(summaryInput).output(profileSummarySchema),
  save: protectedContract
    .input(z.object({ patch: profilePatch, timeZone: timeZone.default("UTC") }))
    .output(profileSummarySchema),
  finishOnboarding: protectedContract.input(summaryInput).output(profileSummarySchema),
  dismissPrompt: protectedContract.input(summaryInput).output(profileSummarySchema),
};
