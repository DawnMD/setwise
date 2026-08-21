CREATE TYPE "public"."activity_kind" AS ENUM('workout', 'rest');--> statement-breakpoint
ALTER TABLE "routine_days" ADD COLUMN "kind" "activity_kind" DEFAULT 'workout' NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "kind" "activity_kind" DEFAULT 'workout' NOT NULL;