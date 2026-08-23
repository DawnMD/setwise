import * as React from "react";

import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/format";
import {
  REST_PRESETS,
  useRestSnapshot,
  type RestTimer as RestTimerStore,
} from "@/hooks/use-rest-timer";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * A slim bar above the nav, never a modal.
 *
 * People need to scroll their log while it runs — checking what they did two
 * exercises ago is exactly what the rest period is for. A dialog would take the
 * screen away at the one moment it is being read.
 *
 * This is the only component subscribed to the countdown. Everything above it
 * hears about the timer twice per set: when it starts and when it stops.
 */
export function RestTimer({ timer }: { timer: RestTimerStore }) {
  const { remaining, duration, done } = useRestSnapshot(timer);
  const [presetsOpen, setPresetsOpen] = React.useState(false);
  const progress =
    duration > 0 ? Math.min(100, Math.max(0, (1 - remaining / duration) * 100)) : 100;

  return (
    <div className="border-t bg-card">
      <Progress value={progress} className="h-0.5 rounded-none" aria-label="Rest progress" />

      <div className="mx-auto flex h-12 w-full max-w-[520px] items-center gap-2 px-4">
        <Button
          variant="ghost"
          size="touch"
          className="-ml-2 items-baseline"
          aria-expanded={presetsOpen}
          onClick={() => setPresetsOpen((value) => !value)}
        >
          <span
            className={cn("numeric-display text-xl", done ? "text-overload" : "text-foreground")}
            // Announced only when it matters. A per-second live region would
            // read the countdown aloud continuously.
            aria-live={done ? "polite" : "off"}
          >
            {done ? "Rest done" : formatDuration(remaining)}
          </span>
          <span className="text-xs font-normal text-muted-foreground">rest</span>
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="touch"
            className="numeric"
            onClick={() => timer.extend(30)}
          >
            +30s
          </Button>
          <Button variant="ghost" size="touch" onClick={() => timer.stop()}>
            {done ? "Dismiss" : "Skip"}
          </Button>
        </div>
      </div>

      {presetsOpen ? (
        <div className="mx-auto w-full max-w-[520px] px-4 pb-3">
          <ToggleGroup
            variant="outline"
            value={[String(duration)]}
            onValueChange={([next]) => {
              if (!next) return;
              timer.start(Number(next));
              setPresetsOpen(false);
            }}
            aria-label="Rest length"
            className="w-full"
          >
            {REST_PRESETS.map((seconds) => (
              <ToggleGroupItem
                key={seconds}
                value={String(seconds)}
                className="numeric h-11 flex-1"
              >
                {formatDuration(seconds)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ) : null}
    </div>
  );
}
