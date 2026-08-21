# Phase 3: progress analytics

Phase 3 is done. That verdict comes from the code, the focused database tests, and a clean
production build. Every item in the original scope has a working query and a visible place on the
Progress screen.

## Scope audit

| Requirement                          | What shipped                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| Effective sets and tonnage by muscle | `stats.muscleVolume` returns all eighteen muscles with window totals and weekly rates   |
| Body heatmap                         | Front and back SVGs are painted with none, low, productive, and high volume bands       |
| 7, 30, and 90-day views              | One toggle drives volume, intensity, exercise history, and bodyweight                   |
| Relative intensity and RPE           | Separate cards show average percent of estimated 1RM and average RPE with sample counts |
| Exercise history                     | The exercise picker draws one estimated 1RM point per session                           |
| Untrained muscles                    | A plain-language alert lists every muscle with no working sets in the window            |

The route is authenticated, and every stats query is scoped to the current user's workout
sessions. Supplying another user's exercise ID cannot expose their history because the session
ownership filter stays in the query.

## What the screen does

The heatmap gives the quick read. Tap a region and the screen shows its effective sets, weekly
rate, and tonnage. The ranked list beneath it carries the same selection state and gives keyboard
and screen-reader users a real control instead of asking them to interact with injected SVG paths.

The untrained-muscle alert matters more than the color ramp. A grey rear delt can be easy to miss
on a small silhouette. "Rear delts" in a list is harder to ignore.

The intensity cards keep two different facts apart. Relative intensity compares a set's weight
with the best estimated 1RM for that exercise in the trailing 90 days. RPE records how the work
felt. Combining them would hide the useful case where the numbers disagree.

Exercise history uses one point per session. Five sets from Tuesday should not become five dots on
the same date. Sessions with no set between 1 and 12 reps have no Epley estimate, so the chart
leaves them out and says why.

## Calls made during the phase

Warm-ups do not count toward volume, tonnage, intensity, or exercise trends. They remain in workout
history for the next-session reference.

Long windows need a weekly rate. Twenty sets over 90 days are not the same training dose as twenty
sets this week. The query returns both the full-window total and a weekly rate, and the heatmap
chooses its band from the weekly rate.

Muscles with no work still come back from the server. An omitted database row would otherwise turn
"nothing trained" into "nothing displayed," which is exactly the wrong failure mode for this
screen.

The exercise picker is ordered by the most recent working set. The default is what the user trained
last, not the first exercise alphabetically.

## Verification

`tests/integration/stats.test.ts` checks the parts most likely to lie quietly:

- all eighteen muscles, including zero-volume rows;
- primary and secondary muscle factors;
- warm-up exclusion;
- tonnage by muscle factor;
- 7-day and 90-day boundaries;
- weekly-rate bands for long windows;
- relative intensity and missing RPE;
- recent-exercise ordering;
- one history point per session; and
- the 12-rep limit for Epley estimates.

The focused suite passes 11 tests. `pnpm build` also completes, including the TypeScript check and
the TanStack Start production server build.

There is no Progress-specific Playwright flow yet. The calculations have database coverage and the
screen compiles into the production bundle, but chart interaction and responsive layout still need
browser regression coverage under phase 8.
