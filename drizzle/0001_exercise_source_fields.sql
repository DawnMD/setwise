ALTER TABLE "exercises" ADD COLUMN "mechanic" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "instructions" text[];--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "source_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_source_id_uq" ON "exercises" USING btree ("source_id") WHERE "exercises"."source_id" is not null;