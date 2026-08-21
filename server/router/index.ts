import { bodyweightRouter } from "./bodyweight";
import { catalogueRouter } from "./catalogue";
import { planRouter } from "./plan";
import { profileRouter } from "./profile";
import { sessionRouter } from "./session";
import { statsRouter } from "./stats";
import "@tanstack/react-start/server-only";

/**
 * Routers are grouped by feature, not by table, and each lives in its own file.
 * The volume query touches four tables and belongs to none of them; the logger
 * spans sessions, sets and personal records and belongs to none of those.
 *
 * This file only composes. Nothing is defined here, so adding `social` in
 * phase 7 is one import and one key.
 */
export const router = {
  session: sessionRouter,
  plan: planRouter,
  catalogue: catalogueRouter,
  stats: statsRouter,
  bodyweight: bodyweightRouter,
  profile: profileRouter,
};

export type AppRouter = typeof router;
