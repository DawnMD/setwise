# Phase 2: the plan builder

Done, alongside a move onto shadcn components. This is what shipped, where it
departs from the plan, and what Phase 3 inherits.

## Acceptance

> Done when: you build a push/pull/legs split and run a week off it without
> editing anything mid-workout.

The split builds and runs. `npm run db:verify:plan` covers the four things a
browser cannot check by looking. Reordering days survives the unique index on
`(routine_id, day_index)`. Ownership is enforced through the join rather than the
id. A session started from a day reads its lineup back in plan order with targets
attached. And "what's next" puts the day you have gone longest without at the
top.

The same caveat as Phase 1 stands. **None of this has been used in a real gym.**

## What shipped

Everything on the Phase 2 list:

- Routines, days, and exercises with target sets, a rep range and an optional
  RPE.
- Starting a session from a routine day, which opens with the lineup already on
  screen and each exercise showing what it is meant to hit.
- Custom exercise creation, tagged by tapping regions on the same two body SVGs
  the heatmap will paint.
- Reordering days and exercises. No supersets.

Plus three things the list did not ask for:

- **What to run next, on the train screen.** `plan.upcoming` returns every day
  of every live routine, least recently run first. Reaching the plan editor to
  start a planned workout is four taps. This is one.
- **Archive as well as delete.** Deleting a routine costs no training history,
  because `routine_day_id` is `set null`, but it does cost the answer to "what
  was I running in March".
- **A theme setting.** The shadcn tokens key off a `.dark` class, so system
  preference needs a provider to apply it at all. Having added one, a manual
  override is three lines more.

## The move to shadcn

The plan always said shadcn on Base UI. Phase 1 used Base UI directly, on the
grounds that `shadcn init` writes its own token set and would fight the palette
Phase 0 established. It would have, and it did. The preset defines `--accent` and
`--border`, which the hand-rolled palette was already using for different things.

The resolution was to give up the argument. The zinc scale from preset
`b2eYKQAHg1` is now the whole of the interface chrome, and the app keeps only
what no design system has an opinion about: `--overload` for beating last
session's number, `--pr` for a record, and the `--band-*` heatmap ramp. A failed
save uses the preset's `--destructive`. Fonts are the exception. Noto Serif and
Public Sans are dropped and both font slots point at Archivo, because the
expanded-width numerals are load-bearing.

**Three components carry a `touch` size the preset does not ship.** Lyra is a
dense style whose largest button is 36px. Anything reachable mid-set needs 44, so
`Button`, `Slider` and `NativeSelect` each gained one. `Badge` gained `pr` and
`overload` variants for the same reason. They are states the app has an opinion
about and a registry cannot.

**Two things stayed bespoke.** The number pad and the plate strip have no
registry equivalent and both are the point of the app. Everything else is now a
shadcn component. The sheets are `Drawer`, the confirmations `AlertDialog`, the
exercise search `Command` with its own filtering off, the rest presets and muscle
chips `ToggleGroup`, the loading states `Skeleton`.

`lib/cn.ts` went with it. It argued against `tailwind-merge` on the grounds that
a class collision means a component is taking overrides it should not. True of
components you write. False of a registry you pull from, where `className`
overriding internals is the entire API.

## Departures from the plan

**The plan is read live, not copied into the session.** A workout started from a
routine day holds only the day id, and the lineup and targets are read back
through `sessionPlan` on every load. A routine edited on Tuesday shows its new
form the next time it runs. Snapshotting would need a table of its own to say
something nobody asked for, and it would make "why does this workout not match my
routine" a real question.

**The logger's lineup is seeded once, in an effect.** The plan arrives with the
session, one round trip after the first render, so there is nothing to seed from
at mount. A ref guards it to one pass. After that the lineup belongs to the user,
and re-seeding would resurrect anything they removed.

**Reordering is a swap with the neighbour, not a drag.** Two taps reorders four
days, and a drag handle on a phone fights the page scroll.

**Days are tabs, not a stacked list.** A push/pull/legs split is three short
lists. Stacking them means scrolling past the two you are not editing every time
you add an exercise to the third.

**A custom exercise needs at least one primary muscle.** Enforced at the
boundary, not just in the form. An exercise with no primary is invisible to every
volume query in the app, so the heatmap would silently under-report training that
did happen. That is worse than refusing to save it.

## The day-reorder swap

`routine_days` carries a unique index on `(routine_id, day_index)`, and a
non-deferrable unique index is checked row by row rather than at the end of the
statement. Writing both new values in one update trips over the pair mid-flight.
`swapDayOrder` parks one row on `-1` first. Negatives are otherwise unreachable,
because every index the app writes is zero or above.

`routine_exercises.order_index` has no unique index, so that swap is two plain
updates.

## A bug this phase found

`uuidv7` seeded its 12-bit intra-millisecond counter anywhere in the full range.
An id minted near `0xfff` rolled the counter over to zero inside the same
millisecond, and the next id then sorted before it, which is exactly the property
the whole choice of v7 over v4 exists to buy. It reproduced about one run in five
at 500 ids.

The seed is now masked to the bottom quarter of the range, leaving 3072
increments of headroom, and on overflow the counter borrows a millisecond instead
of wrapping. RFC 9562 calls this the rollover guard. The same branch covers a
clock that steps backwards.

## Known gaps

- **Not tested in a gym.** Still the real acceptance criterion, now for two
  phases running.
- **No supersets.** Deliberate. The plan defers them.
- **No per-day rest targets or notes.** `routines.notes` exists in the schema and
  nothing writes it.
- **A custom exercise cannot be edited or deleted.** It can be created and used.
  Editing the tagging afterwards means deciding what happens to the volume
  already attributed under the old tags, which is a real question and not one for
  this phase.
- **`cloned_from_id` is unused.** The column exists so a correction to a global
  exercise's tagging can be offered to people who forked it. Nothing forks yet.
- **The muscle picker has no undo.** Tapping cycles through primary, secondary
  and clear, so a mistake costs one more tap, but a long list is fiddly to
  correct.
