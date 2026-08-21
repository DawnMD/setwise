-- The eighteen muscle regions, from `lib/muscles.ts`.
--
-- These rows are reference data, not user data: the app's picker, body SVGs and
-- heatmap all address them by slug, so a database without them cannot save a
-- custom exercise at all. That made `db:seed` -- which also pulls in ~800
-- catalogue exercises -- a hard prerequisite for a working app. It shouldn't be:
-- migrating is what creates a usable database, seeding is what fills it.
--
-- Kept in step with the seed by using its exact upsert: same conflict target,
-- same columns. Seeding after this migration updates eighteen identical rows and
-- changes nothing. Editing the region list still means editing `lib/muscles.ts`,
-- the SVGs and a new migration -- see the note there.
INSERT INTO "muscles" ("slug", "display_name", "svg_path_id", "body_side") VALUES
  ('chest', 'Chest', 'chest', 'front'),
  ('front_delts', 'Front delts', 'front_delts', 'front'),
  ('side_delts', 'Side delts', 'side_delts', 'both'),
  ('rear_delts', 'Rear delts', 'rear_delts', 'back'),
  ('biceps', 'Biceps', 'biceps', 'front'),
  ('triceps', 'Triceps', 'triceps', 'back'),
  ('forearms', 'Forearms', 'forearms', 'both'),
  ('lats', 'Lats', 'lats', 'back'),
  ('traps', 'Traps', 'traps', 'both'),
  ('upper_back', 'Upper back', 'upper_back', 'back'),
  ('lower_back', 'Lower back', 'lower_back', 'back'),
  ('abs', 'Abs', 'abs', 'front'),
  ('obliques', 'Obliques', 'obliques', 'front'),
  ('glutes', 'Glutes', 'glutes', 'back'),
  ('quads', 'Quads', 'quads', 'front'),
  ('hamstrings', 'Hamstrings', 'hamstrings', 'back'),
  ('adductors', 'Adductors', 'adductors', 'front'),
  ('calves', 'Calves', 'calves', 'both')
ON CONFLICT ("slug") DO UPDATE SET
  "display_name" = excluded."display_name",
  "svg_path_id" = excluded."svg_path_id",
  "body_side" = excluded."body_side";
