import * as React from "react";

import type { ProfilePatch } from "@setwise/domain/validators";
import type { UserProfileDto } from "@setwise/api-contract";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { FieldSeparator } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

import {
  ActivityField,
  BirthDateField,
  GoalField,
  HeightField,
  OverrideFields,
  RateField,
  SexField,
} from "./profile-fields";

/**
 * The whole profile in one drawer, for edits after onboarding.
 *
 * The wizard asks one thing at a time because it is talking to someone who has
 * not used the app yet. This is the opposite situation: a returning user who
 * knows exactly which answer they came to change, and would resent five steps
 * to reach it. Same fields, both times, so there is one date picker to fix.
 *
 * Saved as a single patch, because unlike the wizard there is a Save button on
 * screen and nothing is lost by waiting for it.
 */
export function ProfileSheet({
  open,
  onOpenChange,
  profile,
  pending = false,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: UserProfileDto | null;
  pending?: boolean;
  onSave: (patch: ProfilePatch) => Promise<unknown>;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* Mounted per open, so the draft is seeded from the current profile once
          and no effect races whatever is being typed. */}
      {open ? (
        <OpenProfileSheet
          profile={profile}
          pending={pending}
          onSave={onSave}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
    </Drawer>
  );
}

function OpenProfileSheet({
  profile,
  pending,
  onSave,
  onDone,
}: {
  profile: UserProfileDto | null;
  pending: boolean;
  onSave: (patch: ProfilePatch) => Promise<unknown>;
  onDone: () => void;
}) {
  const [draft, setDraft] = React.useState<ProfilePatch>({
    heightCm: profile?.heightCm ?? null,
    sex: profile?.sex ?? null,
    birthDate: profile?.birthDate ?? null,
    activityLevel: profile?.activityLevel ?? null,
    goal: profile?.goal ?? null,
    targetRateKg: profile?.targetRateKg ?? null,
    proteinPerKg: profile?.proteinPerKg ?? null,
    fatPerKg: profile?.fatPerKg ?? null,
    calorieOverride: profile?.calorieOverride ?? null,
  });
  const [failed, setFailed] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const patch = (changes: ProfilePatch) => setDraft((current) => ({ ...current, ...changes }));
  const busy = pending || saving;

  const save = async () => {
    setFailed(false);
    setSaving(true);
    try {
      await onSave(draft);
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DrawerContent className="mx-auto max-h-[90dvh] max-w-[520px]">
      <DrawerHeader>
        <DrawerTitle>Your profile</DrawerTitle>
        <DrawerDescription>
          Only the calorie and macro targets read any of this. Leave anything blank and the numbers
          that need it stay blank too.
        </DrawerDescription>
      </DrawerHeader>

      <div className="flex flex-col gap-5 overflow-y-auto p-4">
        <HeightField value={draft.heightCm ?? null} onChange={(heightCm) => patch({ heightCm })} />
        <BirthDateField
          value={draft.birthDate ?? null}
          onChange={(birthDate) => patch({ birthDate })}
        />
        <SexField value={draft.sex ?? null} onChange={(sex) => patch({ sex })} />

        <FieldSeparator />

        <ActivityField
          value={draft.activityLevel ?? null}
          onChange={(activityLevel) => patch({ activityLevel })}
        />
        <GoalField
          value={draft.goal ?? null}
          onChange={(goal) =>
            patch({
              goal,
              // Same rule as the wizard: no direction, no rate. A stored rate
              // with no goal to sign it is a number nothing can read.
              targetRateKg:
                goal === "maintain" || goal === null
                  ? null
                  : (draft.targetRateKg ?? (goal === "lose" ? 0.5 : 0.25)),
            })
          }
        />
        <RateField
          goal={draft.goal ?? null}
          value={draft.targetRateKg ?? null}
          onChange={(targetRateKg) => patch({ targetRateKg })}
        />

        <FieldSeparator />

        <OverrideFields
          calorieOverride={draft.calorieOverride ?? null}
          proteinPerKg={draft.proteinPerKg ?? null}
          fatPerKg={draft.fatPerKg ?? null}
          onChange={patch}
        />

        {failed ? (
          <Alert variant="destructive">
            <AlertTitle>Profile didn&apos;t save</AlertTitle>
            <AlertDescription>
              Nothing was changed. Check your connection and tap save again.
            </AlertDescription>
          </Alert>
        ) : null}

        <Button size="touch" className="w-full" disabled={busy} onClick={save}>
          {busy ? <Spinner data-icon="inline-start" /> : null}
          Save profile
        </Button>
      </div>
    </DrawerContent>
  );
}
