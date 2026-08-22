# Phase 6: home screen

Phase 6 is done. Setwise opens on a summary instead of on the logger. `/` is the Home screen, Home
is the first tab, and Train went back to being the thing you hold in one hand between sets.

Home is a readout. Nothing on it can be edited, and every number links to the screen that owns it.
The one exception is the button at the top, which starts the workout the rotation says is next,
because a summary you have to leave in order to act on is a summary nobody opens.

## Scope audit

| Requirement                        | What shipped                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| Active workout or next planned day | One card. An open workout wins outright; otherwise the day the rotation puts first         |
| This week's sets and tonnage       | Trailing seven days, working sets only, with the workout count beside them                 |
| Bodyweight direction               | The seven-day trend against the seven-day trend a week earlier, in kilograms a week        |
| Calorie and protein targets        | Read from `profile.get`. Absent, not blank, when the profile cannot produce a number       |
| Untrained muscles                  | Named in words, using the definition Progress already uses                                 |
| One server procedure               | `home.summary`, two statements, one round trip                                             |
| `/` is Home rather than a redirect | `src/routes/_authenticated/index.tsx`, inside the guard rather than in front of it         |
| Home in the navigation             | Five tabs. Home, Train, Progress, Body, Plan                                               |
| Start the right workout in one tap | The primary button on the card starts the next day, or logs rest if that day is a rest day |

## The data

`home.summary` takes a time zone and returns the open workout, the next startable day, whether rest
is already logged today, the week, and the weight direction. It runs two statements at once.

The first is one query for everything read off training and bodyweight rows. The second is
`startableDays`, which Train already uses, called rather than rewritten. That reuse is the point:
the day Home offers to start is by construction the same day Train puts at the top of its list, and
a second copy of the ordering rule is a second copy that can drift. The test asserts the two are
equal rather than asserting Home's answer on its own.

Nothing about the profile is in the response. Calories and protein come from `profile.get`, the
same read Body and the prompt already share. A copy of the targets on this response would be one
that the profile's own writes could not patch, so editing a goal on Body would leave a stale
calorie number on Home until something refetched. Two reads, one batched request, and one canonical
copy of the numbers.

`lib/cache.ts` gained a `home` key, and nearly every write in the app now marks it. That is the
honest cost of a screen that summarises five others. It is one key rather than six because the
whole screen is one read.

## The week

Trailing seven days, not the calendar week. Every other window in the app is trailing, and a Monday
morning that reads "0 sets" would be telling the truth in a way nobody wants at six in the morning.

Fixed, too. There is no window toggle on Home. The plan asked for the untrained muscles in "the
selected weekly window", and a toggle here would have made Home a smaller Progress with the same
controls and less of the data. Home answers today's question. Progress is where you change the
window, and the tile is a link to it.

Warm-ups do not count, which is the same rule the heatmap follows. The untrained list is worked out
by subtracting the slugs that saw work from `MUSCLES` in code, rather than by reading a row per
muscle back from Postgres, so a muscle can never be left off the list by an absent row. The test
asserts it matches `untrainedMuscles(muscleVolume(...))` exactly. If one of the two ever starts
counting warm-ups, that assertion is where it surfaces.

The workout count is there because five sets in one session and five sets across five sessions are
different weeks, and the sets figure alone cannot tell them apart.

## Weight as a direction

The number Home leads with is kilograms a week, not kilograms. That is the unit the goal is set in,
and the only one that answers whether any of this is working.

It is the seven-day mean against the seven-day mean of the week before. Both means, never two
weigh-ins: in the test fixture the trend drops four kilograms while the individual readings inside
it would report six or two depending on which pair you picked. The first of the two windows is the
same one `profileSummary` averages, so the trend on Home and the trend the calorie target is built
from are the same number, and a test pins them together.

A missing prior week gives a null change rather than a zero. "No change" and "nothing to compare
with" are different answers and only one of them is worth printing.

## The screen

The order is the order of the day. The workout first, then whether the week has been enough of one,
then the scale, then what to eat, then what has been missed. On a 390px screen the decision and the
week are both above the fold, which is the whole reason for the screen to exist.

The card at the top has three states. An open workout shows the elapsed time and a Carry on button,
and it wins over everything else, because someone who closed the tab mid-session is not being
offered a choice about what to train. A planned workout day shows its name and gives a Start button
that opens it directly. A planned rest day gives the same confirmation dialog Train uses. With no
usable routine at all, the button starts an empty workout and the copy points at Plan.

Under it, four tiles, each one a link with its own accessible name. Three of them are figures over
labels, laid out in a grid; the untrained one is a sentence, because a list of names is not a
figure.

The grid is what forced two small decisions. At 390px each of three columns gets about 106px, and
the widest thing the week can produce is a grouped five-digit tonnage. So the unit lives in the
label rather than beside the value, which is the difference between "15,720" and "15,720 kg"
breaking onto two lines under a label reading "Tonnage". And the value is set at `text-xl` rather
than `text-2xl`, where "15,720" fills its column and collides with the workout count next to it.
Expanded heavy digits are wide. That is the price of the tabular cut the rest of the app uses, and
the fix is a size, not a different typeface.

The trend rounds to one decimal before it is printed. A mean of seven weigh-ins reads 82.93 if you
let it, and the third digit is a claim the scale never made.

The targets tile disappears when the profile has not answered enough to produce a calorie number,
because the prompt at the top of the screen already names what is missing and a row of dashes
underneath it would say the same thing worse. The untrained tile disappears when there is nothing
to report.

## What moved off Train

Train used to be the front door, and it carried the furniture: the "Setwise" title, the settings
gear, and the dismissible profile prompt that phase 5 said should move here when Home existed. All
three are on Home now. Train's heading says Train.

Its loader also stopped warming `profile.get`. Nothing on that screen is a function of the profile
any more, and prefetching a read the screen never makes is a request spent on the way to the gym.

What Train keeps is the whole rotation rather than Home's single day, plus recent activity. That is
the split: Home is for the day you are having, Train is for the week you want to run out of order.

The start mutation is now `hooks/use-start-workout.ts`, shared by both. The interesting part of it
was never the mutation, it was the typed `SESSION_ALREADY_ACTIVE` branch that sends you to the
workout you already have instead of reporting a failure for something that is not one. Two copies
of that would have become one copy of it eventually.

## Calls made during the phase

`/` moved inside the authenticated boundary rather than keeping its own redirect in front of it.
The old `src/routes/index.tsx` resolved the session on the server and threw a redirect either way,
which is what `_authenticated` already does one level down. A signed-out visit to `/` still lands
on `/sign-in`, from the same server guard every other private route uses, and the browser suite
still asserts it.

Sign-in lands on `/` now. Sign-up still goes to `/onboarding`, unchanged.

The targets tile shows calories and protein only. Fat and carbohydrate stay on Body with the
working behind them. These two are the ones people check against what they have eaten by
mid-afternoon.

Home's code splits into the `_authenticated` chunk group, because `/` is that layout's index route.
That is the right place for it, since an authenticated session starts there, but it means the
chunk is now 4 KB gzip rather than 1 KB. `scripts/check-bundle.ts` had never budgeted
`_authenticated` at all, so it does now.

## Verification

`tests/integration/home.test.ts` runs eight tests against three fixture accounts: one with history,
one mid-workout, one brand new.

They cover the week rollup with a warm-up and an out-of-window session in the way, the untrained
list against the heatmap's own definition, the two-week trend comparison with its hand-worked
figures, the trend agreeing with `profileSummary`, the next day agreeing with `startableDays`, rest
and the open workout reading per account, an empty account producing zeroes and nulls rather than a
crash, and a single week of weigh-ins reporting no change rather than no movement.

The browser suite gained two tests and changed two. Home joined the navigation sweep and the direct
load list. A new test proves Home draws from exactly one request, which the batching test could not
say on its own because a screen with one read does not batch. Another opens Home with a workout
still running and checks it leads with that workout and has already counted the set that workout
confirmed. The batching test went back to pointing at Train, which is the screen with four reads to
batch, and now looks for the heading Train.

116 integration tests and 9 browser tests pass, alongside `format:check`, `lint`, `db:check`,
`build`, and the bundle budgets.

Two things are still outstanding, both carried in from earlier phases. The real-gym logger pass is
overdue and now blocks phase 8. The Vercel preview checklist has not been run for this change, and
`/` changing shape is exactly the kind of thing it exists to catch.
