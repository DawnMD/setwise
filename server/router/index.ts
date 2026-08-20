import { catalogueRouter } from "./catalogue";
import { sessionRouter } from "./session";
import { statsRouter } from "./stats";

/**
 * Routers are grouped by feature, not by table, and each lives in its own file.
 * The volume query touches four tables and belongs to none of them; the logger
 * spans sessions, sets and personal records and belongs to none of those.
 *
 * This file only composes. Nothing is defined here, so adding `plan` in phase 2
 * and `social` in phase 5 is one import and one key.
 */
export const router = {
  session: sessionRouter,
  catalogue: catalogueRouter,
  stats: statsRouter,
};

export type AppRouter = typeof router;
