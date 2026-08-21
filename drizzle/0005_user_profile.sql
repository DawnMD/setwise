CREATE TYPE "public"."activity_level" AS ENUM('sedentary', 'light', 'moderate', 'very', 'athlete');--> statement-breakpoint
CREATE TYPE "public"."goal" AS ENUM('lose', 'maintain', 'gain');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"height_cm" numeric(4, 1),
	"sex" "sex",
	"birth_date" date,
	"activity_level" "activity_level",
	"goal" "goal",
	"target_rate_kg" numeric(3, 2),
	"protein_per_kg" numeric(3, 2),
	"fat_per_kg" numeric(3, 2),
	"calorie_override" integer,
	"onboarding_started_at" timestamp with time zone,
	"onboarding_completed_at" timestamp with time zone,
	"prompt_dismissed_until" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_height_ck" CHECK ("user_profiles"."height_cm" between 100 and 250),
	CONSTRAINT "user_profiles_rate_ck" CHECK ("user_profiles"."target_rate_kg" between 0 and 1.5),
	CONSTRAINT "user_profiles_protein_ck" CHECK ("user_profiles"."protein_per_kg" between 0.5 and 4),
	CONSTRAINT "user_profiles_fat_ck" CHECK ("user_profiles"."fat_per_kg" between 0.2 and 3),
	CONSTRAINT "user_profiles_calories_ck" CHECK ("user_profiles"."calorie_override" between 800 and 8000),
	CONSTRAINT "user_profiles_birth_date_ck" CHECK ("user_profiles"."birth_date" >= date '1900-01-01')
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;