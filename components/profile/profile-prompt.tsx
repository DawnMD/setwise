import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UserRoundCog } from "lucide-react";

import { toIsoDay } from "@/lib/format";
import { PROFILE_FIELD_LABELS, PROMPT_DISMISSAL_DAYS } from "@/lib/nutrition";
import { orpc } from "@/lib/orpc";
import { useTimeZone } from "@/hooks/use-time-zone";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * What an existing account is missing, and where to go and fix it.
 *
 * Phase 5 arrived after people already had training history, so most profiles
 * start empty. A blank calorie card would read as a broken feature; naming the
 * three answers it is waiting for reads as a thing you can finish in a minute.
 *
 * `dismissible` is the difference between the copy of this on a summary screen
 * and the copy on Body or Settings. The first can be silenced for a fortnight.
 * The other two are the screens whose whole subject is the profile, so hiding
 * the reason they are empty there would just be lying to make a screen tidy.
 */
export function ProfilePrompt({ dismissible = false }: { dismissible?: boolean }) {
  const timeZone = useTimeZone();
  const queryClient = useQueryClient();
  const summary = useQuery(orpc.profile.get.queryOptions({ input: { timeZone } }));
  const dismiss = useMutation(
    orpc.profile.dismissPrompt.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.profile.get.key() }),
    }),
  );

  // Silent while loading and silent on error. This is a nudge, and a nudge that
  // flashes in on every navigation is worse than one that arrives a beat late.
  if (!summary.isSuccess) return null;

  const { targets, onboarded, promptDismissedUntil } = summary.data;
  if (targets.missing.length === 0) return null;

  const hushed = promptDismissedUntil !== null && promptDismissedUntil > toIsoDay();
  if (dismissible && hushed) return null;

  return (
    <Alert>
      <UserRoundCog />
      <AlertTitle>
        {onboarded ? "Your targets are missing a few answers" : "Setwise can work out your targets"}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>
          Still needs {targets.missing.map((field) => PROFILE_FIELD_LABELS[field]).join(", ")}. It
          takes about a minute, and none of it is required.
        </span>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" render={<Link to={onboarded ? "/body" : "/onboarding"} />}>
            {onboarded ? "Fill it in" : "Set it up"}
          </Button>
          {dismissible ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={dismiss.isPending}
              onClick={() => dismiss.mutate({ timeZone })}
            >
              Not now
            </Button>
          ) : null}
        </div>
        {dismissible ? (
          <span className="text-xs text-muted-foreground">
            &ldquo;Not now&rdquo; hides this for {PROMPT_DISMISSAL_DAYS} days. Body and Settings
            will still say what is missing.
          </span>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
