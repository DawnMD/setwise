# Setwise build plan

This is the master plan for Setwise. It records what has shipped, what the product now refuses to do, and what remains. Keep implementation notes in the phase documents and setup instructions in the README. This file is for direction.

## Current position

| Phase | Scope                      | Status                                            |
| ----- | -------------------------- | ------------------------------------------------- |
| 0     | Foundation                 | Built                                             |
| 1     | Workout logger             | Built; real-gym acceptance pass still outstanding |
| 2     | Plans and rest days        | Built                                             |
| 3     | Progress analytics         | Built                                             |
| 4     | Bodyweight                 | Built                                             |
| 5     | Onboarding and body screen | Built                                             |
| 6     | Home screen                | Not started                                       |
| 7     | Social                     | Database groundwork only                          |
| 8     | Hardening                  | In progress                                       |

Phase 5 moved bodyweight out of Progress onto its own Body screen, so phase 3 now has the Progress screen to itself. Phase 7 has friendship and visibility tables plus usernames, but no router, route, or UI. Those are foundations, not a finished social feature.

## Decisions that are settled

- Setwise requires a reliable connection while a workout is being recorded.
- Postgres generates session, rest-activity, and set IDs.
- The logger shows a set only after the server confirms it.
- There is no offline queue, persisted workout draft, automatic reconnect write, or client-generated write ID.
- Unsaved exercise picks and rest timers live in memory and reset on navigation or reload.
- Theme is the only local UI preference that persists.
- Stored weights are kilograms. Unit preference is a display concern.
- The product rewards progressive overload. It does not use streaks, XP, badges, or guilt around rest days.
- Nutrition work stops at targets. A food diary, barcode scanner, and meal database are separate products.

These choices can change, but only as product decisions. They should not drift because a new library makes another path convenient.

## Stack and runtime

| Layer              | Choice                             | Reason                                                                   |
| ------------------ | ---------------------------------- | ------------------------------------------------------------------------ |
| App and routing    | TanStack Start and TanStack Router | One Vite application for file routes, server functions, and the document |
| Production server  | Nitro                              | Builds the deployable server used by Vercel                              |
| Database           | Postgres on Neon                   | Strong constraints, date handling, and window queries                    |
| Schema and queries | Drizzle                            | Code-first schema and committed SQL migrations                           |
| API                | oRPC                               | Typed procedures without a code generation step                          |
| Authentication     | Better Auth                        | Cookie sessions stored in the same Postgres database                     |
| Client data        | TanStack Query                     | Query ownership, cache refresh, and typed oRPC mutation options          |
| Components         | shadcn on Base UI                  | Accessible primitives with the `base-lyra` visual system                 |
| Styling            | Tailwind CSS                       | Mobile-first layout and shared theme tokens                              |
| Charts             | Recharts through shadcn Chart      | Enough control for the heatmap, trends, and combined weight chart        |
| Theme              | Local provider                     | Applies light, dark, or system preference before hydration               |
| Tooling            | pnpm, Vitest, Playwright           | One package manager and two levels of behavior checks                    |

TanStack Start owns the root document, file routes, server functions, and production build. The session guard runs on the server at `/` and at the authenticated route boundary. Authenticated routes use data-only SSR: the guard and route data run on the server, while the feature UI renders in the browser and calls oRPC through TanStack Query. Sign-in and sign-up remain server-rendered.

Framework code lives under `src`. Reusable product code remains in `components`, `hooks`, `lib`, `db`, and `server`.

### oRPC rules

Put validation next to the Drizzle schema and reuse it at the API boundary. Define errors on the procedure that owns them. Group procedures by product area, not by table: `session`, `plan`, `catalogue`, `stats`, `bodyweight`, `profile`, and eventually `social`.

## Data model and invariants

The eighteen muscle regions are fixed:

```text
chest, front_delts, side_delts, rear_delts, biceps, triceps, forearms,
lats, traps, upper_back, lower_back, abs, obliques,
glutes, quads, hamstrings, adductors, calves
```

That list drives database rows, SVG path IDs, the heatmap, and the custom-exercise picker. Changing it is a migration, an asset change, and a UI change at the same time.

The main relationships are:

```text
user
  routines
    routine_days (workout or rest)
      routine_exercises
  workout_sessions (workout or rest)
    sets
  bodyweight_logs
  personal_records
  user_profiles (one row, every column nullable)
  friendships
  visibility
```

Postgres enforces the rules that would corrupt history if they were left to the browser:

- One active workout per user.
- One rest activity per user and local calendar day.
- One bodyweight entry per user and calendar day.
- No set writes to finished sessions or rest activities.
- Server-side ownership checks for every private row.
- Exercise visibility checks before a set is written.
- Set reads ordered by `performed_at`, then `set_index`.
- Stable CSV columns and download paths.
- Routine deletion does not delete workout history.

The load-bearing indexes remain `sets(exercise_id, performed_at)` and `workout_sessions(user_id, started_at)`.

`user_profiles` holds height, sex, birth date, activity level, goal, target rate, protein grams per kilogram, fat grams per kilogram, an optional calorie override, two onboarding timestamps, and the prompt dismissal date. Every field is nullable because every onboarding step can be skipped. The target rate is stored unsigned and takes its direction from the goal, so a row cannot say "lose" and "+0.5 kg a week" at once.

## Training math

Write these formulas once and test them. A UI should format the result, not invent a second version.

Estimated 1RM uses Epley for working sets of 1 to 12 reps:

```text
e1rm = weight * (1 + reps / 30)
```

Return no estimate above 12 reps. Epley becomes too loose there.

Effective sets credit primary muscles at 1.0 and secondary muscles at 0.5. Warm-ups do not count. Muscle tonnage uses the same factors:

```text
muscle tonnage = weight * reps * muscle factor
```

Relative intensity is the set weight divided by the best estimated 1RM for that exercise in the previous 90 days. Show average relative intensity beside average RPE. Do not blend them into a made-up score.

Heatmap bands use weekly effective sets:

- 0: none
- 1 to 9: low
- 10 to 19: productive
- 20 or more: high

These are useful landmarks, not a training prescription. A later relative mode may compare a user with their own trailing eight-week median.

Body calculations use the seven-day bodyweight trend, not the latest weigh-in. An empty trailing week produces no target rather than reaching further back for a stale weigh-in.

```text
BMI = kg / (height_m * height_m)

BMR = 10 * kg + 6.25 * cm - 5 * age + sex_constant
sex_constant = 5 for male, -161 for female

TDEE = BMR * activity_factor
calorie_target = TDEE + target_kg_per_week * 7700 / 7
```

Activity factors are 1.2 sedentary, 1.375 light, 1.55 moderate, 1.725 very, and 1.9 athlete. A target that falls below BMR is shown with an explanation rather than raised, because the rate is the thing to change. Targets round to ten calories; the inputs never had four digits of precision.

Protein defaults to 1.8 g/kg and fat to 0.8 g/kg. Carbohydrate gets the remaining calories at 4, 9, and 4 kcal per gram. If protein and fat exceed the target, reduce fat first, floor carbohydrate at zero, and report the shortfall.

BMI needs a permanent caveat because muscular users are exactly where it can mislead. Missing profile data stays missing. Do not guess height, sex, or age to fill a card.

## Workout write path

A new set follows one insert-only path:

1. The drawer holds the entered values. No set row exists yet.
2. `session.createSet` sends the values without an ID.
3. The server checks ownership, exercise visibility, and session state.
4. Postgres inserts the set and generates its ID. The same transaction updates personal-record state.
5. The server returns the confirmed row.
6. The client refreshes session data, closes the drawer, reports records, and starts the rest timer for a working set.

Save stays disabled while the request is running. On failure, the drawer and its values remain open and an inline destructive alert explains what failed. Another press of Save starts a new request.

Editing uses `session.updateSet` with an existing server ID. Deletion is ownership-scoped. The logger never paints an unconfirmed row.

There is one honest drawback. If the database commits but the response disappears, pressing Save again can create a duplicate. The current design accepts that risk. The user can edit or delete the duplicate, and the app never claims an unconfirmed write was saved.

## Product and interface direction

Setwise is a phone tool used between sets. Desktop is a centered version of the phone layout, not a separate product.

The motivating detail is the comparison with the last workout. Put the previous weight and reps beside the new fields. Show the delta as soon as the user beats it. That is the reward. Confetti would only get in the way.

Competition plates supply the useful color language. Blue is the main overload color. Plate colors appear in the loading helper because they mean something there. PRs and destructive errors each get one semantic color. Zero volume is grey, never red.

Use Archivo throughout. Training numbers use the expanded, heavy cut with tabular figures. A changing row should not jitter because a 1 is narrower than an 8.

The phone rules are plain:

- Design at 390px first.
- Keep primary actions in thumb reach.
- Keep mid-workout touch targets at least 44px.
- Use the custom number pad for weight and reps.
- Use `inputmode="decimal"` for weight and `inputmode="numeric"` for reps when the OS keyboard appears.
- Use `100dvh` so browser chrome does not cover the action bar.
- Do not hide meaning in hover.
- Keep the rest timer above the bottom navigation, not in a modal.
- Support light, dark, and system themes.

Buttons name the result: "Finish workout", "Save set", "Log rest day". Empty states tell the user what to do next. Errors say what broke and what action is safe.

## Verification and release bar

`pnpm test` runs the Postgres integration suite. It covers training math, energy and macro math, ownership, plan ordering, confirmed set writes, PR maintenance, rest-day limits, bodyweight bucketing and trends, profile patch semantics, stable CSV output, and the muscle migration.

`pnpm test:e2e` runs the Playwright Chromium smoke suite against the production server. It covers sign-up, sign-in, guarded routes, the onboarding wizard, set creation and editing, in-memory draft boundaries, theme, export, sign-out, and client navigation.

A change is ready when all of this passes:

1. `pnpm format:check`
2. `pnpm lint`
3. `pnpm dlx shadcn@latest info --json`
4. `pnpm db:check`
5. Migrations and seed against a disposable Postgres database
6. `pnpm build`
7. `pnpm test`
8. `pnpm test:e2e`

A Vercel preview still needs a human pass for cookies, `/api/auth/*`, `/api/rpc/*`, `/api/export`, direct protected-route loads, client navigation, confirmed workout behavior, export, and sign-out.

## Work already built

### Phase 0: foundation

Built:

- TanStack Start, TanStack Router, Vite, and Nitro.
- Better Auth email and password accounts with cookie sessions.
- Drizzle schema and migrations on Postgres.
- The eighteen muscle rows in a migration.
- An optional, idempotent global exercise seed.
- Front and back body SVGs.
- Tailwind and the shadcn/Base UI component system.
- Vitest, Playwright, linting, formatting, and CI.

The original OAuth-provider item was dropped. Email and password is the current account surface.

Phase notes: [phase-0.md](phase-0.md).

### Phase 1: workout logger

Built:

- Start, resume, and finish a workout.
- Pick global or custom exercises.
- Log, edit, and delete confirmed sets.
- Custom number pad, warm-up toggle, plate math, last-session values, and overload deltas.
- PR detection on set creation and edit.
- Rest timer with an absolute in-memory deadline.
- Screen Wake Lock while a session is active.
- CSV export for confirmed set history.
- Clear failure state in the open drawer.

The logger no longer uses optimistic rows, UUIDv7 write IDs, retry upserts, or persisted drafts. The remaining acceptance item is a full one-handed workout in a real gym. That test is overdue. Phase 5 shipped without it, so it now blocks the phase 8 sign-off.

Phase notes: [phase-1.md](phase-1.md).

### Phase 2: plans and rest days

Built:

- Create, edit, archive, and delete routines.
- Ordered workout days and exercises.
- Targets for sets, rep ranges, and RPE.
- Start a prefilled workout from a routine day.
- Show upcoming days by least-recently-run order.
- Create a custom exercise from the muscle picker.
- Planned rest days and one rest activity per local day.
- Training history survives routine deletion.

Phase notes: [phase-2.md](phase-2.md).

### Phase 3: progress analytics

Built:

- Effective sets and tonnage by muscle.
- Front and back heatmaps.
- Shared 7, 30, and 90-day windows.
- Average relative intensity beside average RPE.
- Per-exercise estimated 1RM trend.
- A visible list of untrained muscles.
- Keyboard and screen-reader access to the same muscle selection through the volume list.

This phase is complete in the Progress screen.

Phase notes: [phase-3.md](phase-3.md).

### Phase 4: bodyweight

Built:

- One editable weigh-in per calendar day.
- Calendar-date entry, notes, edit, and delete.
- Seven-day rolling average with six days of hidden lead-in.
- User-time-zone bucketing for workout tonnage.
- Bodyweight and tonnage on one chart.
- The same 7, 30, and 90-day control used by progress analytics.
- Theme controls and authenticated CSV downloads in Settings.

Phase notes: [phase-4.md](phase-4.md).

### Phase 5: onboarding and the body screen

Built:

- A nullable `user_profiles` table, one row per user.
- A five-step wizard after sign-up, saved a step at a time, every step skippable.
- BMI, BMR, TDEE, calorie target, and macro targets, all from one library.
- Targets recalculated from the seven-day weight trend.
- Calorie, protein, and fat overrides for people who already know their numbers.
- A dedicated Body screen with today's weigh-in first, and Body as the fourth tab.
- A prompt that names the answers an existing account is missing.
- Two-week dismissal on Train, permanent on Body and Settings.

This phase calculates targets. It does not track food.

The dismissible prompt lives on Train because Train is where the app opens. Phase 6 should move that copy to Home.

Phase notes: [phase-5.md](phase-5.md).

## Work remaining

### Phase 6: home screen

Build one useful first screen:

- Show an active workout or the next planned day.
- Show this week's sets and tonnage.
- Show the bodyweight direction.
- Show today's calorie and protein targets when the profile has enough data.
- Show any muscle with no work in the selected weekly window.
- Fetch the summary through one server procedure.
- Change `/` from a redirect to the Home screen.
- Add Home to the navigation, which already carries Train, Progress, Body, and Plan.

Every number on Home must link to the screen that owns it. Home is a summary, not a second place to edit data.

Done when the user can open Setwise, understand the day without scrolling, and start the right workout in one tap.

### Phase 7: social

The database groundwork exists. The product does not.

Build:

- Username setup and lookup.
- Friend requests, acceptance, rejection, blocking, and deletion.
- Per-field visibility for PRs, calendar, volume, and bodyweight.
- A friend profile that reads only fields the owner shared.
- Tests that prove missing visibility rows fail closed.

Do not add a feed, comments, likes, or public-by-default data. Social comes after there is enough history worth sharing.

### Phase 8: hardening

Some work has landed already: CI runs the full check set, Playwright covers the main browser flow, protected routes have server guards, and reduced-motion CSS exists.

Still needed:

- Run and document the real-gym logger test.
- Audit keyboard flow, focus visibility, labels, and screen-reader output across every route.
- Test current Chrome, Safari, and Firefox mobile behavior.
- Exercise connection loss before and during a save. The UI should explain the state without queuing or replaying writes.
- Verify every migration on a fresh database and on a copy of production-shaped data.
- Record the Vercel preview checklist for each release.
- Check loading time and chart cost on a modest phone.
- Add targeted regression tests whenever one of these checks finds a bug.

Offline storage, a workout outbox, and automatic replay are not phase 8 tasks.

## Cut from the current product

- Offline workout logging and persisted training drafts.
- PWA install work tied to an offline app shell.
- Progress photos and all file storage.
- Food logging and barcode nutrition.
- AI form checks and workout video hosting.
- Gym check-ins, leaderboards, streaks, badges, and XP.
- A social feed, comments, and likes.

CSV export remains account portability. It is not an offline workout store.

## Order of work

1. Finish the real-gym acceptance pass and fix what it exposes.
2. Build phase 6.
3. Finish the phase 8 accessibility, browser, migration, and deployment checks.
4. Build phase 7 only when users have enough history to make sharing useful.

The riskiest existing data problem is still exercise tagging. Bad primary and secondary muscle factors flow straight into the heatmap. Hand-check the exercises people actually use before spending time polishing the long tail.
