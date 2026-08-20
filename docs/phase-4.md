# Phase 4: bodyweight

Done. The weigh-in log, its seven-day average, and training tonnage on the same
axis. This is what shipped, what it decided that the plan left open, and what
Phase 5 inherits.

## Acceptance

The plan gives Phase 4 no "done when", so the list is the bar and all three
items are on screen:

- A weight log with a seven-day rolling average line.
- Charted over the same 7/30/90 windows as the heatmap, driven by the same
  toggle rather than one of its own.
- Total tonnage overlaid on the same chart.

`npm test` includes `tests/integration/bodyweight.test.ts`, twelve checks over
the parts a screenshot cannot confirm: the rolling average against a hand-worked
five-weigh-in series, the lead-in that keeps the first point honest, warm-up
exclusion from tonnage, the window trim, day bucketing in a second time zone,
the per-day upsert, and the delete.

The same caveat as every phase since the first. **None of this has been used in
a real gym.**

## What shipped

Everything on the list, plus four things it needed to be true rather than
merely drawn:

- **A lead-in the chart never shows.** The query reads six days further back
  than the window and trims them after averaging. Without it the first six
  points of every chart are averages of a partial week; they slope toward the
  rest of the line and read as a change in bodyweight that did not happen. On
  the test fixture the difference is a kilo on the first point, and a reported
  change of 1 kg where the truth is 2.
- **The caller's time zone, sent with every read.** A weigh-in is a `date` and
  is local by construction. A set is a timestamp, and bucketing it in UTC files
  a 9pm session under tomorrow for everyone west of it, so the tonnage bars
  would sit a day off the weight line they exist to be compared against.
- **Correction, not just entry.** One row per day, upserted on
  `(user_id, logged_on)`, so weighing twice before coffee overwrites rather than
  double-counts, and a retry after a timeout cannot make a second row. Tapping
  any weigh-in in the list reopens it for editing or deletion. A log you cannot
  fix is a log people stop trusting after their first fat-fingered 828.
- **Bodyweight in the CSV export.** As its own file, at
  `/api/export?data=bodyweight`. Without offline storage the export is the only
  backup, and shipping a second kind of data that could not leave would have
  quietly broken that promise. The sets link is unchanged.

## Decisions the plan left open

**It lives on the Progress screen, under the existing toggle.** The plan says
the window has to mean one thing everywhere; the cheapest way to guarantee that
is one toggle, not two that agree by convention. The nav stays at three items.

**It renders outside the volume branch.** Progress shows an empty state when
there are no working sets in the window. A week with no training is exactly the
week someone is most likely to be watching the scale, so the bodyweight card is
a sibling of that branch rather than a child of it.

**Raw weigh-ins are dots with no line through them.** The plan's reason for the
average is that daily weight is mostly water and showing raw makes people
miserable. Joining the dots draws a sawtooth that reads as three kilos lost
overnight and found again by Thursday. Hiding what someone typed would be worse,
so the readings stay on the chart — they just do not get a line.

**The trend line is neutral and the tonnage bars carry the accent.** `--overload`
means you beat last session. Painting a rising bodyweight with it tells everyone
on a cut they are doing well, and painting a falling one with it tells everyone
bulking the opposite. The app does not know which way you are trying to go, and
the colour would claim it does. Volume is what the accent legitimately belongs
to, so it went to the bars.

**The line breaks over a gap longer than a week.** Seven days with no weigh-in
has no seven-day average. Bridging the hole with a straight segment would invent
one, and the shape of an invented segment is exactly the shape of steady
progress.

**Change is average against average.** Comparing the first and last weigh-in of
a window turns a normal day's water swing into a fortnight of progress, in
whichever direction the noise happened to fall. Both figures are rounded to a
tenth, because that is what a scale reads and the average will otherwise happily
report 82.38.

**The tonnage axis is hidden.** Its numbers run to five figures and would eat a
third of a 390px screen to say what the bars already say by being taller than
each other. The exact figure is in the tooltip and the window total sits under
the chart.

**No goal weight, and no line to be under.** A target line makes every session
above it a failure, including the ones on a planned bulk. The same argument the
plan makes against streaks applies: the app would be giving training advice
through its UI, and it does not know enough to give any.

## Where the numbers come from

One query returns a row per calendar day: the weigh-in if there was one, its
trailing seven-day mean, and the day's working tonnage. Dense rather than one
row per weigh-in, because a gap on a rest day is a fact about the training
rather than a missing point to interpolate through.

The average is a `range between make_interval(days => 6) preceding and current
row` window, so it is seven days of calendar rather than seven rows. Somebody who
weighs in twice a week gets a mean of the two readings actually inside the week,
not of the last seven times they stood on a scale, which for them would span a
month.

Tonnage here is `weight * reps` with no muscle factor. The heatmap's per-muscle
tonnage applies one; summing that across muscles would count a bench press once
for chest, again for triceps and half again for front delts.

## Known gaps

- **Not tested in a gym.** Four phases running.
- **Ninety days is ninety bars.** Thin, but readable, and one code path instead
  of a granularity that changes under the toggle. A weekly rollup at the long
  window is the obvious next move if it reads badly on a real phone.
- **No pounds.** `user.unitPref` still changes nothing. Bodyweight is the place
  the missing display conversion will annoy people most.
- **No import.** The export leaves; nothing comes back. Anyone with years of
  weigh-ins in another app has to retype them.
- **The sheet cannot move a weigh-in to another day.** The date is fixed while
  editing, because a move is a delete and an insert against a unique day and the
  drawer has nowhere honest to say the destination is already taken. Delete and
  re-add does work.
- **Editing the most recent weigh-in shows no ghost.** The line above the pad
  reads the latest weigh-in, which is the row being edited, so it falls back to
  generic advice rather than showing the day before.
- **The list collapses at five rows.** A quarter of daily weigh-ins is 90 rows
  behind one "show all", with no paging and no way to jump to a month.
