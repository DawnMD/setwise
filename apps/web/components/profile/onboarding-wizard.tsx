import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";

import {
  BODYWEIGHT_MAX,
  BODYWEIGHT_MIN,
  BODYWEIGHT_STEP,
  bodyweightKg,
  type ProfilePatch,
} from "@/db/validators";
import { toIsoDay } from "@/lib/format";
import { BODYWEIGHT_TREND_DAYS } from "@/lib/math";
import type { ActivityLevel, Goal, Sex } from "@/lib/nutrition";
import { afterWrite, putProfileSummary } from "@/lib/cache";
import { orpc } from "@/lib/orpc";
import { queries } from "@/lib/queries";
import { useTimeZone } from "@/hooks/use-time-zone";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { NumberPad } from "@/components/logger/number-pad";

import {
  ActivityField,
  BirthDateField,
  GoalField,
  HeightField,
  OverrideFields,
  RateField,
  SexField,
} from "./profile-fields";
import { TargetsCard } from "./targets-card";

type StepId = "weight" | "about" | "activity" | "goal" | "targets";

const STEPS: { id: StepId; title: string; blurb: string }[] = [
  {
    id: "weight",
    title: "What do you weigh?",
    blurb: `Every calculation on the Body screen runs off your ${BODYWEIGHT_TREND_DAYS}-day average, so it starts here.`,
  },
  {
    id: "about",
    title: "A few fixed numbers",
    blurb: "Height, date of birth and sex are the three terms in the BMR formula.",
  },
  {
    id: "activity",
    title: "How much do you move?",
    blurb: "This multiplies your resting burn into a maintenance figure.",
  },
  {
    id: "goal",
    title: "What are you aiming for?",
    blurb: "The direction and the speed set the gap between maintenance and your target.",
  },
  {
    id: "targets",
    title: "Here are your targets",
    blurb: "Recalculated from your weight trend every time it moves. Override anything you like.",
  },
];

/**
 * The first-use wizard.
 *
 * Five steps, each saved on its own the moment it is answered, each skippable.
 * Nothing is held until a final submit, so closing the tab at step three keeps
 * steps one and two — which matters, because this runs before the user has any
 * reason to trust the app with a second attempt.
 *
 * Skip is a real button next to Continue rather than a small link in a corner.
 * A wizard that hides its exit is a wizard people abandon at the first question
 * they would rather not answer.
 */
export function OnboardingWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const timeZone = useTimeZone();
  const [index, setIndex] = React.useState(0);

  const summary = useQuery(queries.profile(timeZone));
  const save = useMutation(orpc.profile.save.mutationOptions());
  const finish = useMutation(orpc.profile.finishOnboarding.mutationOptions());
  const logWeight = useMutation(orpc.bodyweight.log.mutationOptions());

  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const leave = async () => {
    const profile = await finish.mutateAsync({ timeZone });
    putProfileSummary(queryClient, timeZone, profile);
    await navigate({ to: "/body", replace: true });
  };

  const advance = () => {
    if (last) {
      void leave();
      return;
    }
    setIndex((current) => current + 1);
  };

  /**
   * Saves a step and moves on. A failure keeps you on the step with the values
   * still on screen, the same way the set drawer does: the app never claims a
   * write it did not get an answer for.
   */
  const commit = async (patch: ProfilePatch) => {
    // The response is the recalculated summary, which is the wizard's own data
    // source. Written straight in, so the targets step renders the numbers this
    // step produced rather than fetching them back to find out.
    const profile = await save.mutateAsync({ patch, timeZone });
    putProfileSummary(queryClient, timeZone, profile);
    advance();
  };

  if (summary.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-4 py-6">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (summary.isError) {
    return (
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-4 py-6">
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load your profile</AlertTitle>
          <AlertDescription>Check your connection and try again.</AlertDescription>
        </Alert>
        <Button size="touch" onClick={() => void summary.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const profile = summary.data.profile;
  const failed = save.isError || finish.isError || logWeight.isError;
  const busy = save.isPending || finish.isPending || logWeight.isPending;

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex flex-col gap-2">
        <Progress
          value={((index + 1) / STEPS.length) * 100}
          aria-label={`Step ${index + 1} of ${STEPS.length}`}
        />
        <span className="numeric text-xs text-muted-foreground">
          Step {index + 1} of {STEPS.length}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{step.title}</h1>
        <p className="text-sm text-muted-foreground">{step.blurb}</p>
      </div>

      {step.id === "weight" ? (
        <WeightStep
          pending={busy}
          onSave={async (weight) => {
            const result = await logWeight.mutateAsync({
              loggedOn: toIsoDay(),
              weight,
              note: null,
              timeZone,
            });
            putProfileSummary(queryClient, timeZone, result.profile);
            await afterWrite.bodyweightLogged(queryClient);
            advance();
          }}
          onSkip={advance}
        />
      ) : step.id === "about" ? (
        <AboutStep
          initial={{
            heightCm: profile?.heightCm ?? null,
            birthDate: profile?.birthDate ?? null,
            sex: profile?.sex ?? null,
          }}
          pending={busy}
          onSave={commit}
          onSkip={advance}
        />
      ) : step.id === "activity" ? (
        <ActivityStep
          initial={profile?.activityLevel ?? null}
          pending={busy}
          onSave={commit}
          onSkip={advance}
        />
      ) : step.id === "goal" ? (
        <GoalStep
          initial={{ goal: profile?.goal ?? null, targetRateKg: profile?.targetRateKg ?? null }}
          pending={busy}
          onSave={commit}
          onSkip={advance}
        />
      ) : (
        <TargetsStep
          targets={summary.data.targets}
          initial={{
            calorieOverride: profile?.calorieOverride ?? null,
            proteinPerKg: profile?.proteinPerKg ?? null,
            fatPerKg: profile?.fatPerKg ?? null,
          }}
          pending={busy}
          onSave={commit}
          onSkip={() => void leave()}
        />
      )}

      {failed ? (
        <Alert variant="destructive">
          <AlertTitle>That didn&apos;t save</AlertTitle>
          <AlertDescription>
            Your answer is still on screen. Check your connection and try again.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-auto flex flex-col gap-2 pt-4">
        {index > 0 ? (
          <Button
            variant="ghost"
            size="touch"
            className="w-full"
            disabled={busy}
            onClick={() => setIndex((current) => current - 1)}
          >
            Back
          </Button>
        ) : null}
        {last ? null : (
          <Button variant="link" size="sm" disabled={busy} onClick={() => void leave()}>
            Skip the rest — you can finish this from Body later
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The step footer. Every step has the same two buttons in the same order, so
 * "skip" never lands where "continue" was a moment ago.
 */
function StepActions({
  pending,
  canContinue,
  continueLabel,
  onContinue,
  onSkip,
}: {
  pending: boolean;
  canContinue: boolean;
  continueLabel: string;
  onContinue: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="touch"
        className="w-full"
        disabled={!canContinue || pending}
        onClick={onContinue}
      >
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {continueLabel}
      </Button>
      <Button variant="outline" size="touch" className="w-full" disabled={pending} onClick={onSkip}>
        Skip this
      </Button>
    </div>
  );
}

function WeightStep({
  pending,
  onSave,
  onSkip,
}: {
  pending: boolean;
  onSave: (weight: number) => Promise<void>;
  onSkip: () => void;
}) {
  const [weight, setWeight] = React.useState("");
  const check = bodyweightKg.safeParse(Number.parseFloat(weight));
  const problem = weight === "" || check.success ? null : check.error.issues[0]?.message;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5 rounded-none border bg-muted px-3 py-2">
        <span className="text-xs text-muted-foreground">Weight (kg)</span>
        <span
          className={`numeric-display text-3xl leading-tight ${weight === "" ? "text-muted-foreground/50" : ""}`}
        >
          {weight === "" ? "0" : weight}
        </span>
      </div>

      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}

      {/* The same pad the logger uses, for the same reason: several Android
          keyboards have no decimal key, and the decimal is half the number. */}
      <NumberPad
        onChange={setWeight}
        allowDecimal
        step={BODYWEIGHT_STEP}
        min={BODYWEIGHT_MIN}
        max={BODYWEIGHT_MAX}
      />

      <StepActions
        pending={pending}
        canContinue={check.success}
        continueLabel="Save and continue"
        onContinue={() => {
          if (check.success) void onSave(check.data);
        }}
        onSkip={onSkip}
      />
    </div>
  );
}

function AboutStep({
  initial,
  pending,
  onSave,
  onSkip,
}: {
  initial: { heightCm: number | null; birthDate: string | null; sex: Sex | null };
  pending: boolean;
  onSave: (patch: ProfilePatch) => Promise<void>;
  onSkip: () => void;
}) {
  const [heightCm, setHeightCm] = React.useState(initial.heightCm);
  const [birthDate, setBirthDate] = React.useState(initial.birthDate);
  const [sex, setSex] = React.useState(initial.sex);

  return (
    <div className="flex flex-col gap-5">
      <HeightField value={heightCm} onChange={setHeightCm} />
      <BirthDateField value={birthDate} onChange={setBirthDate} />
      <SexField value={sex} onChange={setSex} />
      <StepActions
        pending={pending}
        // Any one of the three is worth saving. All three or nothing would be
        // the form-shaped version of this screen, and the point of the design
        // is that it is not one.
        canContinue={heightCm !== null || birthDate !== null || sex !== null}
        continueLabel="Save and continue"
        onContinue={() => void onSave({ heightCm, birthDate, sex })}
        onSkip={onSkip}
      />
    </div>
  );
}

function ActivityStep({
  initial,
  pending,
  onSave,
  onSkip,
}: {
  initial: ActivityLevel | null;
  pending: boolean;
  onSave: (patch: ProfilePatch) => Promise<void>;
  onSkip: () => void;
}) {
  const [activityLevel, setActivityLevel] = React.useState(initial);

  return (
    <div className="flex flex-col gap-5">
      <ActivityField value={activityLevel} onChange={setActivityLevel} />
      <StepActions
        pending={pending}
        canContinue={activityLevel !== null}
        continueLabel="Save and continue"
        onContinue={() => void onSave({ activityLevel })}
        onSkip={onSkip}
      />
    </div>
  );
}

function GoalStep({
  initial,
  pending,
  onSave,
  onSkip,
}: {
  initial: { goal: Goal | null; targetRateKg: number | null };
  pending: boolean;
  onSave: (patch: ProfilePatch) => Promise<void>;
  onSkip: () => void;
}) {
  const [goal, setGoal] = React.useState(initial.goal);
  const [targetRateKg, setTargetRateKg] = React.useState(initial.targetRateKg);

  return (
    <div className="flex flex-col gap-5">
      <GoalField
        value={goal}
        onChange={(next) => {
          setGoal(next);
          // Holding weight has no rate. Leaving a stale 0.5 behind would make
          // the stored row disagree with the screen that wrote it.
          if (next === "maintain" || next === null) setTargetRateKg(null);
          else if (targetRateKg === null) setTargetRateKg(next === "lose" ? 0.5 : 0.25);
        }}
      />
      <RateField goal={goal} value={targetRateKg} onChange={setTargetRateKg} />
      <StepActions
        pending={pending}
        canContinue={goal !== null}
        continueLabel="Save and continue"
        onContinue={() => void onSave({ goal, targetRateKg })}
        onSkip={onSkip}
      />
    </div>
  );
}

function TargetsStep({
  targets,
  initial,
  pending,
  onSave,
  onSkip,
}: {
  targets: React.ComponentProps<typeof TargetsCard>["targets"];
  initial: {
    calorieOverride: number | null;
    proteinPerKg: number | null;
    fatPerKg: number | null;
  };
  pending: boolean;
  onSave: (patch: ProfilePatch) => Promise<void>;
  onSkip: () => void;
}) {
  const [overrides, setOverrides] = React.useState(initial);
  const [editing, setEditing] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      <TargetsCard targets={targets} />

      {targets.calories === null ? (
        <p className="text-sm text-muted-foreground">
          Not enough answers for a calorie target yet. You can fill the rest in from Body whenever
          you feel like it, or type your own number below.
        </p>
      ) : null}

      {editing ? (
        <OverrideFields
          calorieOverride={overrides.calorieOverride}
          proteinPerKg={overrides.proteinPerKg}
          fatPerKg={overrides.fatPerKg}
          onChange={(patch) => setOverrides((current) => ({ ...current, ...patch }))}
        />
      ) : (
        <Button variant="outline" size="touch" onClick={() => setEditing(true)}>
          I already have my own numbers
        </Button>
      )}

      {/*
        The last step has no "skip": Finish is already the way out, and a second
        button offering to leave would be the same door twice.
      */}
      <Button
        size="touch"
        className="w-full"
        disabled={pending}
        onClick={() => {
          if (editing) void onSave(overrides);
          else onSkip();
        }}
      >
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {editing ? "Save and finish" : "Finish"}
      </Button>
    </div>
  );
}
