import type { ContractRouterClient as ORPCContractRouterClient } from "@orpc/contract";

import { bodyweightContract } from "./bodyweight";
import { catalogueContract } from "./catalogue";
import { homeContract } from "./home";
import { planContract } from "./plan";
import { profileContract } from "./profile";
import { sessionContract } from "./session";
import { statsContract } from "./stats";

export const appContract = {
  home: homeContract,
  session: sessionContract,
  plan: planContract,
  catalogue: catalogueContract,
  stats: statsContract,
  bodyweight: bodyweightContract,
  profile: profileContract,
};

export type AppContract = typeof appContract;
export type ContractRouterClient = ORPCContractRouterClient<typeof appContract>;

export * from "./dto";
export type { HomeSummaryDto } from "./home";
