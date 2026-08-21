# Workout tracker: build plan

## Stack

| Layer          | Pick                 | Why                                                                                                                                                                        |
| -------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DB             | Postgres (Neon)      | Window functions for the weekly rollups, branching for schema work                                                                                                         |
| Schema/queries | Drizzle              | Migrations in TypeScript, no codegen step                                                                                                                                  |
| API            | oRPC                 | End-to-end types with no codegen, and it emits an OpenAPI spec for free when you build a native app later                                                                  |
| Auth           | Better Auth          | Sessions in your own Postgres, no vendor lock                                                                                                                              |
| Client state   | TanStack Query       | oRPC ships a first-party integration, so `orpc.sets.log.mutationOptions()` is the whole wiring                                                                             |
| Components     | shadcn/ui on Base UI | Base UI became shadcn's default in July 2026, so `npx shadcn create` gets you there with no flags. Running on preset `b2eYKQAHg1`: style lyra, zinc, lucide, medium radius |
| Styling        | Tailwind             | Comes with shadcn, and mobile-first breakpoints are the default direction                                                                                                  |
| Charts         | Visx or Recharts     | Recharts is faster to write, Visx looks better. shadcn's `Chart` wraps Recharts, which settles it                                                                          |
| Theme          | next-themes          | The shadcn tokens key off a `.dark` class, so system preference needs a provider to apply it                                                                               |

Swap in PocketBase if you want one binary instead of five services. Everything below still applies, just with collections instead of tables.

### On oRPC specifically

Define the contract once and both sides inherit it. Worth setting up on day one rather than retrofitting:

- Put your Zod schemas next to the Drizzle schema and reuse them as oRPC inputs. One definition of what a valid set is, enforced at the client input, the API boundary, and the database.
- Use `.errors()` to declare typed errors per procedure. A failed set save should return a discriminated error you can pattern-match on the client, not a 500 you parse from a string.
- Group procedures into routers by feature, not by table: `session`, `plan`, `stats`, `social`. The heatmap query touches four tables and belongs to none of them.

## Fix the muscle list before anything else

This list becomes table rows, SVG path ids, and the muscle picker. Changing it later breaks all three at once.

```
chest, front_delts, side_delts, rear_delts, biceps, triceps, forearms,
lats, traps, upper_back, lower_back, abs, obliques,
glutes, quads, hamstrings, adductors, calves
```

Eighteen regions. Fine enough to be useful, coarse enough that you can actually draw them.

## Schema

```sql
users(id, email, display_name, unit_pref, created_at)

muscles(id, slug, display_name, svg_path_id, body_side)
-- body_side: 'front' | 'back' | 'both'

exercises(
  id, name, slug, equipment, movement_pattern,
  owner_id NULL,          -- NULL = global, set = user's custom exercise
  cloned_from_id NULL,
  created_at
)
-- unique(owner_id, lower(name))

exercise_muscles(exercise_id, muscle_id, role, factor)
-- role: 'primary' | 'secondary'
-- factor: 1.0 for primary, 0.5 for secondary
-- primary key (exercise_id, muscle_id)

routines(id, user_id, name, notes, is_archived)
routine_days(id, routine_id, day_index, name)
routine_exercises(id, routine_day_id, exercise_id, order_index,
                  target_sets, target_rep_low, target_rep_high, target_rpe)

sessions(id, user_id, routine_day_id NULL, started_at, ended_at, notes)

sets(
  id UUID,                -- client-generated UUIDv7, this is the idempotency key
  session_id, exercise_id,
  set_index, weight, reps, rpe NULL,
  is_warmup BOOL DEFAULT false,
  performed_at,
  client_created_at       -- for ordering when offline writes land late
)

bodyweight_logs(id, user_id, weight, logged_on, note)
-- unique(user_id, logged_on)

personal_records(id, user_id, exercise_id, kind, value, set_id, achieved_at)
-- kind: 'max_weight' | 'best_e1rm' | 'max_reps_at_weight' | 'session_volume'

body_profiles(user_id PK, height_cm, sex, birth_date, activity_level, goal,
              rate_kg_per_week, protein_g_per_kg, fat_g_per_kg,
              calorie_override NULL, onboarded_at NULL, prompted_at NULL)
-- sex: 'male' | 'female'          -- nullable; only Mifflin-St Jeor reads it
-- activity_level: 'sedentary' | 'light' | 'moderate' | 'very' | 'athlete'
-- goal: 'lose' | 'maintain' | 'gain'
-- every field nullable: each onboarding step is skippable

friendships(id, requester_id, addressee_id, status, created_at)
-- status: 'pending' | 'accepted' | 'blocked'
-- unique on least/greatest pair so A->B and B->A can't both exist

visibility(user_id, field, level)
-- field: 'prs' | 'calendar' | 'volume' | 'bodyweight'
-- level: 'private' | 'friends'
-- everything defaults to 'private'
```

Index `sets` on `(exercise_id, performed_at)` and `sessions` on `(user_id, started_at)`. Those two carry every stats query you'll write.

## The math, written down once

**Estimated 1RM** (Epley), only for working sets with reps between 1 and 12:

```
e1rm = weight * (1 + reps / 30)
```

Above 12 reps Epley drifts badly. Return null rather than a bad number.

**Effective sets on a muscle**, over any window:

```sql
select m.slug, sum(em.factor) as effective_sets
from sets s
join exercise_muscles em on em.exercise_id = s.exercise_id
join muscles m on m.id = em.muscle_id
join sessions ses on ses.id = s.session_id
where ses.user_id = $1
  and s.is_warmup = false
  and s.performed_at >= now() - ($2 || ' days')::interval
group by m.slug;
```

**Tonnage on a muscle**: same query, `sum(s.weight * s.reps * em.factor)`.

**Relative intensity per set**: `weight / (best e1rm for that exercise in the last 90 days)`. Report the window's average. Show it next to average RPE, never blended into one number.

**Heatmap bands** by weekly effective sets: 0 is grey, 1 to 9 is low, 10 to 19 is the productive range, 20 or more is high. These come from common hypertrophy volume landmarks and are a starting point, not gospel. Let the user turn on a relative mode later that compares against their own trailing 8-week median.

**BMI**: `kg / (cm / 100)^2`, banded on the WHO cutoffs — under 18.5, 18.5 to 24.9, 25 to 29.9, 30 and over. It reads high on muscular builds, which is this app's whole audience, so it is reported with that caveat attached and never as a verdict.

**Basal metabolic rate** (Mifflin-St Jeor), the reason sex and birth date are asked for at all:

```
bmr = 10 * kg + 6.25 * cm - 5 * age + (male ? 5 : -161)
```

**Total daily energy**: `bmr * activity`, where activity is 1.2 sedentary, 1.375 light, 1.55 moderate, 1.725 very, 1.9 athlete.

**Calorie target**: `tdee + rate_kg_per_week * 7700 / 7`, taking 7700 kcal to the kilogram. Floor it at BMR and say so on screen when it clamps, rather than handing someone a number that reads as instruction to eat below their resting requirement.

The weight in all three is the seven-day trend, not the last weigh-in. The trend is already computed for the chart and is already the honest number; keying a calorie target to a raw reading makes it swing on water.

**Macro split**, anchored to bodyweight rather than to percentages: `protein_g = protein_g_per_kg * kg` (default 1.8), `fat_g = fat_g_per_kg * kg` (default 0.8), carbohydrate takes whatever calories are left at 4, 9 and 4 kcal per gram. When protein and fat alone exceed the target, fat gives way first and carbohydrate floors at zero. Return the shortfall rather than a negative gram count.

## Write path

Online only for the MVP. Logging a set goes:

1. Client generates a UUIDv7 for the row.
2. TanStack Query optimistic mutation puts the set in the cache immediately, so the UI never waits on the network.
3. POST with that id. Server does `insert ... on conflict (id) do update`.
4. On failure, show a retry affordance on that specific set. **Do not roll the cache back.** Removing the row takes someone's numbers off the screen at the moment they need to read them back. Turn the row red instead. The contract that matters is that nothing which failed is ever displayed as saved.

Two details that are not optional even without offline support.

**Keep the client-generated id.** It makes retries idempotent, which matters most in exactly the case you're now exposed to: the request times out, the user has no idea whether it saved, they tap again. With a client id the second tap is a no-op. With a server id it's a duplicate set that quietly corrupts their volume numbers.

**Fail loudly, per set.** A failed save must show as a red row with a retry button, not a toast that scrolls away. The worst outcome is someone finishing a workout believing it was recorded. Add a blocking warning on session finish if any set is unsaved.

Accept the tradeoff honestly: in a basement gym this app will not work. If that turns out to be your own gym, offline moves back up the list. The outbox version is roughly a day's work on top of this design, since the id and upsert scheme is already in place.

## UI direction

The brief is minimal and motivating, on a phone, without looking like every other AI-built fitness app.

### The trap to avoid

Open any fitness app and you'll find near-black surfaces with one acid-lime accent, gradient stat cards, and a streak counter with a flame. That look isn't wrong, it's just the default nobody chose. Streaks are worse than a cliche here: they punish deload weeks, and deloads are correct training. An app that guilts you for a planned rest week is giving bad advice through its UI.

Skip confetti, badges, XP, and level-ups too. Lifters find them condescending, and the real motivator is already in your data.

### Where the motivation actually comes from

Progressive overload is the entire sport. The most motivating thing this app can do is put last session's number directly against the field where you type this session's number.

Make that the signature element. Every weight input carries a ghost value of what you did last time, and the delta appears the moment you exceed it. `+2.5 kg` in the accent color, in the row, no animation. That single detail does more for retention than any streak system, and it's honest, because it's just your own data pointed at you.

### Palette from the subject

Competition plates have standardised colors: 25kg red, 20kg blue, 15kg yellow, 10kg green, 5kg white. Every lifter reads them without thinking.

Take the 20kg blue as your single accent. Use the full set only inside the plate math visualiser, where the colors carry real meaning and instantly look right to anyone who's loaded a bar. Everywhere else stays neutral.

Two semantic colors beyond that. One for a PR, one for a failed save. No third.

For the heatmap, ramp a single hue from the surface color to the accent. Zero volume is flat grey, not red. Red reads as injury or error, and a muscle you skipped isn't an error.

**How this landed on the preset.** The shadcn preset supplies the zinc scale, which is the whole of the interface chrome, and `--destructive` for the failed save. On top of it the app defines two colors and one ramp. `--overload` (the 20kg blue) marks beating last session's number and tops the heatmap, `--pr` marks a record, and `--band-*` fills in between. Watch for the collision if you switch presets. `--accent` and `--border` are shadcn's names, so app colors cannot use them.

### Type

This app is mostly numbers, read at a glance, from a phone on the floor, three feet away.

Use one variable superfamily with a width axis, Archivo works well and is free. Set weights and reps in the expanded cut at heavy weight, everything else in the regular cut. One family, two clearly different voices, no font pairing to get wrong. Turn on tabular figures everywhere numbers can change, or your set rows will jitter as digits swap.

Inter is fine and also what every AI-generated interface picks. If you want it, at least earn the numerals separately.

### Mobile-first, concretely

The phone is the only viewport that matters. Design at 390px and let desktop be a centered column.

**Build a custom number pad.** This is the highest-value UI decision in the whole app. The OS keyboard covers half the screen, has no decimal on some Android keyboards, and produces constant mistypes with wet hands. A bottom sheet with big digits plus `+2.5` / `-2.5` increment buttons is faster, and lets people log a set without looking closely.

Everything else follows from thumb reach:

- Primary actions live in the bottom third. Never a top-right save button.
- Bottom nav, three items: Train, Progress, Plan. Three because that's genuinely the count, not because three looks nice.
- 44px minimum touch targets. Chalky, sweaty hands. The lyra style is dense, and its largest button is 36px, so `Button`, `Slider` and `NativeSelect` each carry a `touch` size added on top of the preset's scale. Use it for anything reachable mid-set.
- `inputmode="decimal"` on weight and `inputmode="numeric"` on reps, for the cases where the OS keyboard still appears.
- `100dvh` not `100vh`, or browser chrome eats your action bar.
- No hover state carries meaning. There is no hover.
- Rest timer as a slim persistent bar above the nav, never a modal. People need to scroll their log while it runs.

Build light-first and ship both themes on system preference. Gym lighting is unpredictable and most fitness apps default dark because it photographs well, not because it reads well.

### Copy

Sentence case throughout. Buttons name the outcome: "Finish workout", not "Submit". The same word survives the whole flow, so "Finish workout" produces "Workout saved".

Empty states give an instruction, not a mood. "No workouts yet" plus a button beats an illustration and a friendly line. Errors say what broke and what to do: "Set didn't save. Tap to retry." No apology, no vagueness.

### Base UI notes

Base UI is the shadcn default now, so nothing special to configure. Two things that matter for this app: it handles focus trapping and ARIA in the bottom sheet you'll build the number pad inside, and its Slider is what you want for the RPE input. RPE on a 6 to 10 scale with half steps is a slider, not a dropdown, and definitely not a text field.

In practice the bottom sheet is shadcn's `Drawer`, which wraps Base UI's and brings swipe-to-dismiss. `Sheet` is the side panel; do not reach for it on a phone.

## Testing

`npm test` runs Vitest against the Postgres database configured in `.env.local`.
This is an integration suite on purpose. There is no component suite or broad
unit-test pass yet. A few deterministic contracts from the old verification
programs stay beside the database flows, and Vitest is not being asked to fake
async Server Components.

The suite covers the contracts that are hard to trust by clicking around:

- Stats checks effective-set factors, warm-up exclusion, time windows, tonnage,
  zero-volume muscles, and heatmap bands against a hand-worked week.
- Logger checks plate loading, UUIDv7 ordering, Epley limits, overload deltas,
  ghost values, idempotent set retries, PR creation, and PR cleanup after edits.
- Plan checks target round-tripping, safe day swaps, ownership, planned-session
  prefill, next-day ordering, and keeping workout history after routine deletion.
- Bodyweight checks the rolling average against a hand-worked series, the
  lead-in behind its first point, days with no weigh-in, tonnage per day with
  warm-ups excluded, day bucketing in a second time zone, the per-day upsert,
  and the delete.

Each file creates throwaway users and removes them when it finishes. Files run
one at a time to keep database connections predictable. The database must be
migrated and seeded first. Browser flows and the real-gym check remain manual
until an end-to-end runner is added.

## Phases

### Phase 0: foundation (done)

- Repo, Drizzle schema, migrations running
- Better Auth with email and one OAuth provider
- Seed the exercise database. Start from `yuhonas/free-exercise-db` (~800 exercises, public domain, includes images). Its muscle tags are coarse, so budget a day to hand-correct primary/secondary on the 150 exercises people actually do. The long tail can stay rough.
- Draw the two SVGs. Front and back, every path carrying an id from the muscle list. Buy one rather than drawing it if you value your evenings.

Done when: you can query effective sets for a hand-inserted week and the number is right.

What shipped and what it cost: [phase-0.md](phase-0.md).

### Phase 1: the logger (done)

This is the app. Everything else is a feature.

- Start session, pick exercise, log set, finish session
- The custom number pad. Build this in phase 1, not later. It changes how every other screen gets laid out.
- Rest timer. Use the Screen Wake Lock API to keep the phone awake during a session. It works in plain mobile browsers over https, no service worker needed.
- Last-session ghost values in every weight and rep input, with the delta shown once you beat it
- Warm-up toggle per set
- Plate math helper, using the competition plate colors
- Optimistic set logging with per-row failure and retry
- PR detection on set save
- CSV export. Moved up from the old phase 6. It's an afternoon of work, it's the best trust signal a fitness app can give, and without offline storage it's also the user's only backup.

Done when: you can log a full workout on a phone, one-handed, without zooming.

Test this in a real gym before building anything else. Every UX flaw shows up in the first session and none of them show up at a desk. **Still not done.**

What shipped, and where it departed from this list: [phase-1.md](phase-1.md).

### Phase 2: plan builder (done)

- Create routine, add days, add exercises with target sets and rep ranges
- Start a session from a routine day, pre-filled
- Custom exercise creation, with the SVG muscle picker for tagging
- Reorder, supersets can wait

Three things this list did not ask for and the phase needed anyway:

- **What to run next, on the train screen.** Starting a planned day only from the plan editor means four taps before every workout. `plan.upcoming` returns the days of every live routine, least recently run first, so the rotation looks after itself mid-week.
- **The plan is read live, not snapshotted into the session.** A routine edited on Tuesday should show its new form the next time it runs. A copy taken at start would need its own table to say something nobody asked for.
- **Archive, not just delete.** Deleting a routine costs no training history, because `routine_day_id` is `set null`, but it does cost the answer to "what was I running in March".

Done when: you build a push/pull/legs split and run a week off it without editing anything mid-workout.

What shipped, and the move onto shadcn that came with it: [phase-2.md](phase-2.md).

### Phase 3: heatmap and stats

- Weekly summary: effective sets and tonnage per muscle, painted on the SVG
- 7/30/90 day toggle
- Average %e1RM and average RPE, side by side
- Per-exercise history chart with e1RM trend
- Flag muscles at zero for the window, which is the single most actionable thing this screen can say

Done when: the heatmap tells you something about your training you didn't already know.

### Phase 4: bodyweight (done)

- Weight log with a 7-day rolling average line, because daily weight is mostly water and showing raw makes people miserable
- Chart it against the same 7/30/90 windows as the heatmap, so the toggle means one thing everywhere in the app
- Overlay total tonnage on the same axis. Bodyweight moving while volume climbs is the story people actually want, and nobody else shows it on one chart.

Three things this list did not ask for and the phase needed anyway:

- **Six days of lead-in that never get drawn.** A seven-day average needs seven days of history, so the first six points of any window are averages of a partial week unless the query reaches back past its own start. They slope toward the rest of the line and report a change that did not happen.
- **The reader's time zone, sent with every read.** A weigh-in is a `date` and is already local. A set is a timestamp, and bucketing it in UTC files an evening session under tomorrow for everyone west of it, which slides the bars a day off the line they are drawn against.
- **A correction path.** One row per day, upserted, with edit and delete from the list. A log nobody can fix after a mistyped digit is a log they stop trusting.

What shipped, and the calls the list left open: [phase-4.md](phase-4.md).

### Phase 5: onboarding and the body screen

Nothing in this app knows anything about the person using it, and a new account lands on an empty logger with no idea what to do first.

- A profile table of its own: height in centimetres, sex, birth date, activity level, goal and pace. Every field nullable, because every step that fills it is skippable. It does not go on the auth table, whose additional fields are all text.
- A first-run wizard after sign-up, saving as it advances, so someone who quits at the goal question keeps their height. It does not ask for units: `unit_pref` is display-only and still unwired, and asking a question the app then ignores is worse than not asking.
- BMI, BMR by Mifflin-St Jeor, TDEE, and a calorie target, with a macro split anchored to bodyweight in g/kg for protein and fat and carbohydrate taking the remainder. All editable, all recalculated as bodyweight moves.
- Weight gets its own section rather than the last block on the stats screen, and logging today's weigh-in is the first thing on it.

Five decisions the list above does not make on its own:

- **Targets, not tracking.** No food diary, no food database, no barcode scanner. Those are cut from v1 and they stay cut. This phase calculates numbers and gets out of the way.
- **Calories key off the seven-day trend, not this morning's reading.** The trend already exists and is already the honest number. A calorie target keyed to a raw weigh-in swings on water, in a place where swinging reads as instruction.
- **Missing data shows as missing.** No default height, no assumed sex. A card that cannot be computed names the field it wants and links to the step that asks for it. BMI needs only height and weight, so it appears while BMR still cannot.
- **BMI is stated, never ruled on.** It reads high on muscular builds, which is the entire audience of this app. The caveat is permanent and sits next to the number, not behind an info icon.
- **Accounts that predate this get told.** The prompt on the home screen dismisses for a fortnight, not forever; the body screen and settings keep theirs until the profile is filled. A section that quietly stays empty for everyone who already signed up is a section nobody discovers.

Done when: a fresh account goes from sign-up to a calorie target without leaving the app, and an older one is told what it is missing rather than shown a blank card.

### Phase 6: the home screen

- One glance: the workout in progress or the next planned day, this week's sets and tonnage, where bodyweight is going, today's calorie and protein target, and any muscle gone untrained.
- One procedure behind it. The landing screen composes the existing query helpers on the server rather than firing six round trips from the client.
- `/` becomes that screen instead of a redirect to `/train`.
- Bottom nav goes to five: Home, Train, Progress, Plan, Body. Three was the honest count when there were three screens.

Two things this screen must not become:

- **No streak, no flame, no badge.** The rule from the UI direction section holds hardest here, because the home screen is exactly where every other fitness app puts one. It punishes deload weeks, and a deload is correct training.
- **No number that lives only here.** Everything on it summarises a screen that owns it and taps through to that screen. A dashboard that becomes the only place a value appears is a dashboard nobody can correct a typo from.

Done when: you can open the app, read where you stand without scrolling, and start the right workout in one tap.

### Phase 7: social

Only after there's history worth showing.

- Friend requests by username
- Per-field visibility toggles, everything defaulting to private
- Friend profile: PRs, workout calendar, weekly volume, subject to their toggles
- Block, and a real delete path for the friendship row

No feed, no comments, no likes. Those bring moderation work you don't want to own.

### Phase 8: hardening

- Reconnect handling: when `navigator.onLine` flips back true, retry any failed sets automatically
- Keyboard focus visible everywhere, `prefers-reduced-motion` respected
- Deferred: install prompt, offline app shell, the write outbox, and progress photos. All become worth doing once real people use this daily.

## Cut from v1

**Progress photos and all file storage.** No R2, no uploads, no presigned URLs, no image processing. This removes an entire service, the most sensitive data in the app, and a surprising amount of work around thumbnails and orientation metadata. Add `photos` to the visibility table when it comes back, and keep it private-only when it does.

**Offline support and PWA install**, deferred rather than abandoned. See the write path section for what to preserve so they stay cheap to add.

Barcode nutrition scanning, AI form checking, workout video hosting, gym check-ins, leaderboards, streaks. Every one of them is a separate app wearing your app's clothes.

## The one thing most likely to sink this

Seeding 800 exercises with wrong muscle factors. The heatmap is your differentiator and it inherits every tagging error directly. Get the top 150 exercises right by hand, verify a few weeks of your own training against what the SVG shows, and only then care about the long tail.
