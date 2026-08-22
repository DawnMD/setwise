-- One open workout per user, enforced by the database rather than by a read
-- followed by an insert. Two taps on a slow connection could win that race and
-- leave an account with two open sessions it can only ever see one of.
--
-- Existing data may already contain such a pair, and the index cannot be built
-- over it. The older ones are closed at their last set, or at their start time
-- when they have no sets: an abandoned workout that was never finished is
-- history now, and dropping it would be deleting training someone did.
UPDATE "workout_sessions" AS ws
SET "ended_at" = COALESCE(
  (SELECT MAX(s."performed_at") FROM "sets" s WHERE s."session_id" = ws."id"),
  ws."started_at"
)
WHERE ws."ended_at" IS NULL
  AND ws."id" <> (
    SELECT newest."id"
    FROM "workout_sessions" newest
    WHERE newest."user_id" = ws."user_id" AND newest."ended_at" IS NULL
    ORDER BY newest."started_at" DESC, newest."id" DESC
    LIMIT 1
  );
--> statement-breakpoint
CREATE UNIQUE INDEX "workout_sessions_one_open_uq" ON "workout_sessions" USING btree ("user_id") WHERE "workout_sessions"."ended_at" is null;
