# Phase 5: onboarding and the body screen

Phase 5 is done. Setwise now asks a new account five questions, turns the answers into a calorie
and macro target, and gives bodyweight its own screen instead of a section at the bottom of
Progress.

This phase calculates targets. It does not track food, and nothing here moves it closer to doing
so.

## Scope audit

| Requirement                        | What shipped                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| Nullable profile table             | `user_profiles`, one row per user, every column nullable, six check constraints                   |
| First-use wizard after sign-up     | `/onboarding`, five steps, each saved on its own the moment it is answered                        |
| Every step skippable               | Skip sits beside Continue on every step, and finishing with nothing answered is a valid outcome   |
| BMI, BMR, TDEE, calories, macros   | `lib/nutrition.ts`, pure functions, 29 tests                                                      |
| Recalculated from the weight trend | `trendWeight` returns the seven-day mean, and every target reads it rather than the last weigh-in |
| Overrides                          | Calorie override wins outright; protein and fat take grams per kilogram                           |
| Dedicated Body screen              | `/body`, today's weigh-in first, then targets, then the chart that used to live on Progress       |
| Missing-data prompt                | `ProfilePrompt` names the answers still outstanding rather than rendering an empty card           |
| Two-week dismissal                 | `prompt_dismissed_until`, honoured on Train, ignored on Body and Settings                         |

## The data

`user_profiles` holds height, sex, birth date, activity level, goal, target rate, the two macro
ratios, a calorie override, two onboarding timestamps, and the prompt dismissal date. Its primary
key is the user id, so there is no second profile to reconcile.

Every column is nullable, and that is the design rather than a shortcut. Onboarding asks a stranger
five questions before they have logged a set. Each one can be refused, each one is saved on its
own, and a profile row is a partial answer sheet rather than a form that has to be completed before
it counts.

The weekly rate is stored unsigned, and the direction lives in `goal`. A row can never say "lose"
and "+0.5 kg a week" at the same time, because the sign is derived at read time by `weeklyRateKg`.

The macro ratios default to null rather than to 1.8 and 0.8. Someone who never opens the override
fields inherits any later correction to the defaults instead of a value frozen at signup.

The birth date check is a floor at 1900 rather than "not in the future", because a Postgres check
constraint has to be immutable and `current_date` is not. The real bound, between 13 and 120 years
old, lives in Zod, where it is re-evaluated on the day it is asked.

## The math

`lib/nutrition.ts` holds every formula, and the client, the API, and the tests all read the same
copy.

BMI is kilograms over height in metres squared. BMR is Mifflin-St Jeor, chosen over
Harris-Benedict because it has been the more accurate of the two since the nineties, and over
Katch-McArdle because that one needs a body-fat percentage Setwise does not collect. TDEE is BMR
times an activity factor from a five-item list. The calorie target shifts TDEE by the energy in the
weekly rate, at 7700 kcal per kilogram.

Nothing is guessed. A missing height produces a null BMI, a null BMR, and a null calorie target,
never a plausible number built on an assumed 175 cm. `bodyTargets` returns a `missing` list naming
each answer it is waiting on, and the screen prints it.

Targets round to ten calories. The inputs are a height rounded to the centimetre, an activity
factor picked off a list, and a rate measured against a scale that swings a kilo with the weather.
A target reading 2347 would claim four digits of precision the arithmetic never had.

A target under BMR gets reported rather than clamped. Someone who asked for 1.5 kg a week gets the
number their choice implies plus a destructive alert saying what it is. Raising it silently would
hide the fact that the rate is the thing to change.

Macros split the calorie number in force, override included. Protein and fat are grams per
kilogram; carbohydrate takes the remainder. When the two floors do not fit inside the target, fat
gives way first, carbohydrate floors at zero, and any calories protein overshot by are reported as
a shortfall on screen.

Every calculation runs on the seven-day bodyweight trend, never the last weigh-in. `trendWeight`
returns null when the trailing week is empty rather than reaching further back. A three-week-old
weigh-in is not what someone weighs, and saying so is more use than a stale target nobody can tell
is stale. It still returns the last reading at any age, so the screen can say how stale it is.

## The screens

### The wizard

It asks weight, then the three BMR terms, then activity, then goal and rate, then shows the targets
with the overrides behind one button. Each step saves before it advances, so closing the tab at step
three keeps steps one and two. That matters because this runs before the user has any reason to
trust the app with a second attempt.

Skip is a full-width button next to Continue rather than a link in a corner. A wizard that hides
its exit is a wizard people abandon at the first question they would rather not answer. Finishing
with everything skipped still stamps `onboarding_completed_at`, because declining every question
is an answer about wanting to be asked.

### The Body screen

It leads with today's weigh-in, which is the one thing on the screen that is an action rather than
a readout, and the number everything below it is computed from. Targets come next, then BMI and the
working behind it, then the chart and the weigh-in list that used to sit at the bottom of Progress.

The BMI caveat is permanent rather than conditional on the band. Anyone carrying appreciable muscle
reads high on it, and this is an app for lifters.

### The prompt

It names what is missing and links to the place to fix it. Dismissible on Train, where it would
otherwise nag someone arriving to lift. Never dismissible on Body or Settings, whose whole subject
is the profile.

## Calls made during the phase

Bodyweight moved out of Progress rather than being duplicated. Progress keeps a link to Body in the
same position the section used to occupy, so a week with no working sets still puts the scale one
tap away.

Body took the fourth tab in the bottom nav. Weighing in is a daily act and it was buried under a
heatmap.

Sign-up redirects to `/onboarding` and sign-in still goes to `/train`. Every step is skippable, so
this costs a returning user nothing and saves a new one from finding an empty Body screen.

The dismissible prompt lives on Train because Train is where the app opens. Phase 6 builds Home
and the dismissible copy should move there; Body and Settings keep the permanent one either way.

`profile.get` returns the profile, the trend, and the computed targets together. Every number on
the screen is a function of all three, and a screen that renders BMI from one fetch and calories
from another can contradict itself for a frame. Every write returns the same shape, so the wizard
shows a live target without a second copy of the formulas in the browser.

## Verification

`tests/integration/profile.test.ts` runs 29 tests over four areas:

- the formulas, hand-worked, including both sex constants, all five activity factors, and the
  rounding;
- the failure modes, covering every single missing term, the below-BMR report, fat giving way
  before protein, and the carbohydrate floor with its shortfall;
- the patch semantics, where an absent key leaves a field alone and an explicit null clears it; and
- persistence, covering the start stamp that does not move, per-user isolation, finishing
  onboarding with nothing answered, the two-week dismissal in the reader's own zone, and the trend
  ignoring weigh-ins older than a week while still reporting the last one.

The Playwright suite gained a run through the wizard that answers four steps, skips date of birth,
checks the screen names the answer it is missing, and confirms the step-one weigh-in survives the
four saves after it. `/body` and `/onboarding` joined the guarded-route list and the navigation
sweep.

78 integration tests and 6 browser tests pass, alongside `format:check`, `lint`, `db:check`,
migration against the development database, and `build`.

The Vercel preview pass is still outstanding, and so is the real-gym logger test carried over from
phase 1.
