/**
 * Shared shapes for the logger.
 *
 * Aliased from the server's query types rather than restated, so the optimistic
 * rows the client writes into the cache are the same shape as the rows the
 * server returns. A drift between the two would show up as a set that changes
 * appearance the moment it saves.
 */

import type { SessionDetail, SessionExercise, SetRow } from "@/server/queries/session";
import type { PlannedExercise } from "@/server/queries/plan";

export type LoggerSet = SetRow;
export type LoggerExercise = SessionExercise;
export type LoggerSession = SessionDetail;
export type LoggerPlannedExercise = PlannedExercise;

/**
 * Per-row save state.
 *
 * `failed` is a row that stays on screen in red with a retry button, never a
 * toast. The worst outcome this app can produce is someone finishing a workout
 * believing it was recorded.
 */
export type RowStatus = "saved" | "saving" | "failed";
