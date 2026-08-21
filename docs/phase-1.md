# Phase 1: the logger

Done, with one caveat that matters. This is what shipped, where it departs from
the plan, and what Phase 2 inherits.

## Acceptance

> Done when: you can log a full workout on a phone, one-handed, without zooming.

The flow works end to end: start a workout, search the catalogue, log sets from
the number pad, rest, finish, review. Every touch target is at least 44px, every
primary action is in the bottom third, and the layout is built at 390px with
desktop as a centred column.

**It has not been tested in a real gym.** The plan is explicit that this is the
step that matters — "every UX flaw shows up in the first session and none of them
show up at a desk" — and it has only been driven in a browser. Do that before
building Phase 2.

`npm test` includes `tests/integration/logger.test.ts`, which covers what a
browser cannot check by looking: plate loading against hand-worked answers,
UUIDv7 shape and ordering, the Epley window, the overload delta, and then a real
session through the write path. It checks that a retry upserts rather than
duplicates, PR detection reports what it beat, and a warm-up sets no records.

## What shipped

Everything on the Phase 1 list:

- Start session, pick exercise, log set, finish session.
- The custom number pad, built as one sheet for the whole set rather than a bare
  pad.
- Rest timer with the Screen Wake Lock API held for the length of the workout.
- Last-session ghost values behind every weight and rep input, with the delta the
  moment you beat them.
- Warm-up toggle per set.
- Plate math in the competition colours.
- Optimistic set logging with per-row failure and retry.
- PR detection on set save.
- CSV export.

Plus two things Phase 1 could not run without: sign-in and sign-up screens, which
Phase 0 left undone, and the three-item bottom nav.

## Departures from the plan

**A failed save is not rolled back.** The plan says to roll the cache back and
show a retry affordance. Removing the row would take someone's numbers off the
screen at the exact moment they need to read them back, so the row stays and
turns red with Retry and Discard on it. The contract the plan actually cares
about is intact: nothing that failed is ever displayed as saved, the failure is
per row and does not scroll away, and finishing with unsaved sets is blocked
behind a dialog that offers Retry all before Finish anyway.

**The number pad is a whole set-entry sheet.** Weight and reps share one pad,
with a Next button between them. Two separate pads would double the taps on the
single most repeated action in the app.

**Exercises with no sets exist only on the client.** There is no
`session_exercises` table, so an exercise you have picked but not logged against
has no row to live in. The pick order is kept in `localStorage` per session, so a
refresh does not wipe a lineup someone just set up, and anything the server knows
about is appended on load. A session opened on a second device shows the
exercises in logged order rather than pick order.

**PR badges are not restored on reload.** `personal_records` has the row, so the
history is complete, but the badge is session-local state. Re-celebrating a PR
every time someone reopens a workout would make the badge mean nothing.

**A first-ever set is recorded as a PR but not celebrated.** Detection returns
`previous: null` for it and the UI only shows a badge when `previous` is a real
number. The data stays complete; the interface stays quiet.

**Base UI directly, not shadcn.** The plan says shadcn on Base UI. `shadcn init`
writes its own token set, which would fight the palette Phase 0 already
established. Base UI is installed on its own and the three primitives that
actually need it — the Drawer behind every sheet, the Slider for RPE, the Switch
for the warm-up toggle — are wrapped in `components/ui`. Note the package was
renamed from `@base-ui-components/react` to `@base-ui/react`; the old name is
deprecated.

**Session-volume records fire on finish, not on set save.** A session's volume is
only known once the session is over. Checking per set would log a PR on set two
and again on set three. The update that closes the session is conditional on
`ended_at is null`, which is what makes a double tap on Finish detect once.

## The write path, as built

1. The client mints a UUIDv7 and writes the set into the TanStack Query cache
   before the request leaves, so the UI never waits on the network.
2. `POST` with that id. The server upserts on it inside a transaction that also
   runs PR detection, so a record can never be logged against a set that failed
   to store.
3. On failure the row is marked failed and turns red. The stored input is kept so
   Retry replays the identical payload — same id, so the retry is a no-op if the
   first attempt actually landed.

`performedAt` is deliberately not touched on conflict. A retry that rewrote it
would move a set into a later stats window than the one it happened in.

PR detection reads previous bests from `sets`, not from `personal_records`. The
PR table is an append-only log of what happened; reading bests from it would let
an edited or deleted set leave a phantom record standing as the number to beat.
Existing PR rows for a set id are cleared before new ones are written, so the
retry path cannot log the same PR twice.

## Structure

Two changes to the layout of the repo, at your request:

- **No `src/`.** `app/`, `components/`, `db/`, `hooks/`, `lib/` and `server/` sit
  at the root, and `@/*` now resolves to `./*`.
- **One router file per feature.** `server/router/index.ts` only composes;
  `session.ts`, `catalogue.ts` and `stats.ts` define. Read queries live under
  `server/queries/`, so a router file is procedures and typed errors and nothing
  else.

Zod schemas that describe a valid set live in `db/validators.ts`, next to the
Drizzle schema and imported by both the router and the client, as the plan asks.
They import nothing from the database, so they are safe in a client bundle.

## Known gaps

- **Not tested in a gym.** See above. This is the real acceptance criterion.
- **No unit toggle.** Everything is stored and displayed in kilograms.
  `user.unitPref` exists and `lib/format.ts` already converts; nothing reads it
  yet.
- **The plate math assumes a 20 kg bar.** No per-exercise bar weight, so it is
  wrong for a 15 kg women's bar, a trap bar or a safety squat bar. It only shows
  for `equipment = "barbell"`.
- **Editing a set does not renumber its siblings.** `setIndex` is assigned once
  at creation; deleting set 2 of 4 leaves the rest at 0, 2, 3. Ordering is still
  correct, and the display number is derived, so nothing shows wrong.
- **No reconnect handling.** A failed set waits for a manual retry.
  `navigator.onLine` auto-retry is Phase 8.
