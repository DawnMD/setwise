/**
 * Shared shapes for the logger.
 *
 * Aliased from the shared API contract rather than server query types, so the
 * browser and native clients render the same confirmed response shapes.
 */

import type {
  LastPerformanceDto,
  PlannedExerciseDto,
  SessionDetailDto,
  SessionExerciseDto,
  WorkoutSetDto,
} from "@setwise/api-contract";

export type LoggerSet = WorkoutSetDto;
export type LoggerExercise = SessionExerciseDto;
export type LoggerSession = SessionDetailDto;
export type LoggerPlannedExercise = PlannedExerciseDto;
export type LoggerLastPerformance = LastPerformanceDto;
