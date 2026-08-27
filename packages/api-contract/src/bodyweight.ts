import { z } from "zod";

import { bodyweightLogInput, isoDay, statWindow, timeZone } from "@setwise/domain/validators";
import { bodyweightLogSchema, bodyweightSeriesSchema, profileSummarySchema } from "./dto";
import { protectedContract } from "./shared";

const bodyweightProcedure = protectedContract.errors({
  LOG_NOT_FOUND: { message: "There's no weigh-in on that day." },
});

export const bodyweightContract = {
  series: bodyweightProcedure
    .input(z.object({ window: statWindow.default(7), timeZone: timeZone.default("UTC") }))
    .output(bodyweightSeriesSchema.extend({ window: statWindow })),
  log: bodyweightProcedure
    .input(bodyweightLogInput.extend({ timeZone: timeZone.default("UTC") }))
    .output(z.object({ log: bodyweightLogSchema, profile: profileSummarySchema })),
  remove: bodyweightProcedure
    .input(z.object({ loggedOn: isoDay, timeZone: timeZone.default("UTC") }))
    .output(z.object({ loggedOn: isoDay, profile: profileSummarySchema })),
};
