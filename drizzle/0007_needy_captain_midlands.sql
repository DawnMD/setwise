CREATE TABLE "habit_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"habit_id" uuid NOT NULL,
	"completed_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"archived_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_completions" ADD CONSTRAINT "habit_completions_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "habit_completions_habit_day_uq" ON "habit_completions" USING btree ("habit_id","completed_on");--> statement-breakpoint
CREATE INDEX "habits_active_user_idx" ON "habits" USING btree ("user_id") WHERE "habits"."archived_on" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "habits_active_name_uq" ON "habits" USING btree ("user_id",lower("name")) WHERE "habits"."archived_on" is null;