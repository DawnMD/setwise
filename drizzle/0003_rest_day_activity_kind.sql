DO $$ BEGIN
 CREATE TYPE "public"."activity_kind" AS ENUM('workout', 'rest');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "routine_days" ADD COLUMN IF NOT EXISTS "kind" "activity_kind" DEFAULT 'workout' NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN IF NOT EXISTS "kind" "activity_kind" DEFAULT 'workout' NOT NULL;
