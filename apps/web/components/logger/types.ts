/**
 * Shared shapes for the logger.
 *
 * Aliased from the server's query types rather than restated, so the client
 * always renders the exact rows confirmed by the server.
 */

import type {
  LastPerformance,
  SessionDetail,
  SessionExercise,
  SetRow,
} from "@/server/queries/session";
import type { PlannedExercise } from "@/server/queries/plan";

export type LoggerSet = SetRow;
export type LoggerExercise = SessionExercise;
export type LoggerSession = SessionDetail;
export type LoggerPlannedExercise = PlannedExercise;
export type LoggerLastPerformance = LastPerformance;
