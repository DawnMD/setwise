import { Info, TriangleAlert } from "lucide-react";

import { formatWeight } from "@setwise/domain/format";
import { BODYWEIGHT_TREND_DAYS } from "@setwise/domain/math";
import { PROFILE_FIELD_LABELS, type BodyTargets } from "@setwise/domain/nutrition";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Everything the profile calculates, and everything it could not.
 *
 * The order is deliberate: the calorie target first because it is the answer
 * people came for, then the macros that split it, then the working — BMR, TDEE,
 * BMI — underneath for anyone who wants to check the arithmetic. A number that
 * could not be produced is stated as missing rather than left as a gap.
 */
export function TargetsCard({ targets }: { targets: BodyTargets }) {
  const { macros } = targets;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-none border bg-card p-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">
            Daily calories
            {targets.calorieSource === "override" ? " · your own number" : ""}
          </span>
          <span className="numeric-display text-4xl leading-none">
            {targets.calories === null ? "—" : targets.calories.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">
            {targets.calories === null ? "Needs the answers below" : describeIntent(targets)}
          </span>
        </div>

        {macros ? (
          <div className="grid grid-cols-3 gap-2">
            <Macro label="Protein" grams={macros.proteinG} />
            <Macro label="Fat" grams={macros.fatG} />
            <Macro label="Carbs" grams={macros.carbG} />
          </div>
        ) : null}

        {/*
          A deficit under resting expenditure is not refused, it is named. The
          rate is the thing to change, and clamping the number would hide the
          only sentence that says so.
        */}
        {targets.belowBmr ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>That target sits below your resting burn</AlertTitle>
            <AlertDescription>
              Eating under {Math.round(targets.bmr!).toLocaleString()} kcal is below what your body
              spends doing nothing. Slow the rate down, or keep the target and know what it is.
            </AlertDescription>
          </Alert>
        ) : null}

        {macros && macros.shortfallKcal > 0 ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>Protein alone overshoots this target</AlertTitle>
            <AlertDescription>
              Your protein target is {macros.shortfallKcal.toLocaleString()} kcal past the calorie
              target on its own, so fat and carbohydrate are both at zero. Raise the calories or
              lower the protein.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat
          label={`Weight (${BODYWEIGHT_TREND_DAYS}-day average)`}
          value={targets.weightKg === null ? "—" : `${formatWeight(round(targets.weightKg, 1))} kg`}
        />
        <Stat
          label="BMI"
          value={targets.bmi === null ? "—" : String(round(targets.bmi, 1))}
          footnote={targets.bmiBand ?? undefined}
        />
        <Stat
          label="BMR"
          value={targets.bmr === null ? "—" : `${Math.round(targets.bmr).toLocaleString()} kcal`}
          footnote="at rest"
        />
        <Stat
          label="TDEE"
          value={targets.tdee === null ? "—" : `${Math.round(targets.tdee).toLocaleString()} kcal`}
          footnote="maintenance"
        />
      </div>

      {/*
        Permanent, not dismissible, and not conditional on the band. A lifter
        carrying real muscle is the exact case BMI misreads, and this app is
        for lifters.
      */}
      {targets.bmi !== null ? (
        <Alert>
          <Info />
          <AlertTitle>BMI does not know what you are made of</AlertTitle>
          <AlertDescription>
            It is height and weight and nothing else. Anyone carrying an appreciable amount of
            muscle reads high on it. The trend line and the tape measure are better evidence.
          </AlertDescription>
        </Alert>
      ) : null}

      {targets.missing.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Still missing: {targets.missing.map((field) => PROFILE_FIELD_LABELS[field]).join(", ")}.
        </p>
      ) : null}
    </div>
  );
}

/** A calorie number on its own is arithmetic. This line says what it is for. */
function describeIntent(targets: BodyTargets): string {
  if (targets.calorieSource === "override") return "Set by you, not calculated";
  if (targets.weeklyRateKg === null) return "From your activity level";
  if (targets.weeklyRateKg === 0) return "Maintenance, from your activity level";
  const direction = targets.weeklyRateKg < 0 ? "down" : "up";
  return `${formatWeight(Math.abs(round(targets.weeklyRateKg, 2)))} kg a week ${direction}`;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function Macro({ label, grams }: { label: string; grams: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-none border bg-background px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="numeric-display text-xl">{grams}g</span>
    </div>
  );
}

function Stat({ label, value, footnote }: { label: string; value: string; footnote?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-none border bg-card px-3 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="numeric-display text-2xl">{value}</span>
      {footnote ? (
        <span className="text-[11px] leading-tight text-muted-foreground">{footnote}</span>
      ) : null}
    </div>
  );
}
