import type { Router } from "@orpc/server";

import { appContract } from "@setwise/api-contract";
import { createBodyweightRouter } from "./router/bodyweight";
import { createCatalogueRouter } from "./router/catalogue";
import { createHomeRouter } from "./router/home";
import { createPlanRouter } from "./router/plan";
import { createProfileRouter } from "./router/profile";
import { createSessionRouter } from "./router/session";
import { createStatsRouter } from "./router/stats";
import {
  createProcedureImplementers,
  type ApiDependencies,
  type ApiPrincipal,
  type ApiRequestContext,
  type SessionResolver,
} from "./procedure";

export function createApiRouter(dependencies: ApiDependencies) {
  const procedures = createProcedureImplementers(dependencies);

  const router = {
    home: createHomeRouter(procedures.protectedApi.home),
    session: createSessionRouter(procedures.protectedApi.session),
    plan: createPlanRouter(procedures.protectedApi.plan),
    catalogue: createCatalogueRouter({
      protectedProcedure: procedures.protectedApi.catalogue,
      publicProcedure: procedures.publicApi.catalogue,
    }),
    stats: createStatsRouter({
      protectedProcedure: procedures.protectedApi.stats,
      publicProcedure: procedures.publicApi.stats,
    }),
    bodyweight: createBodyweightRouter(procedures.protectedApi.bodyweight),
    profile: createProfileRouter(procedures.protectedApi.profile),
  } satisfies Router<typeof appContract, ApiRequestContext>;

  return router;
}

export type AppRouter = ReturnType<typeof createApiRouter>;

export { memoizeSessionResolver } from "./procedure";
export type { ApiDependencies, ApiPrincipal, ApiRequestContext, SessionResolver };
