"use client";

import * as React from "react";

import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import { REST_PRESETS } from "@/hooks/use-rest-timer";

/**
 * A slim bar above the nav, never a modal.
 *
 * People need to scroll their log while it runs — checking what they did two
 * exercises ago is exactly what the rest period is for. A dialog would take the
 * screen away at the one moment it is being read.
 */
export function RestTimer({
  remaining,
  duration,
  done,
  onExtend,
  onSkip,
  onRestart,
}: {
  remaining: number;
  duration: number;
  done: boolean;
  onExtend: (seconds: number) => void;
  onSkip: () => void;
  onRestart: (seconds: number) => void;
}) {
  const [presetsOpen, setPresetsOpen] = React.useState(false);
  const progress = duration > 0 ? Math.min(1, Math.max(0, 1 - remaining / duration)) : 1;

  return (
    <div className="border-t border-border bg-surface-raised">
      <div
        aria-hidden
        className={cn("h-0.5 origin-left transition-transform", done ? "bg-accent" : "bg-accent/60")}
        style={{ transform: `scaleX(${progress})` }}
      />

      <div className="mx-auto flex h-12 w-full max-w-[520px] items-center gap-2 px-4">
        <button
          type="button"
          onClick={() => setPresetsOpen((value) => !value)}
          aria-expanded={presetsOpen}
          className="flex items-baseline gap-2"
        >
          <span
            className={cn(
              "numeric-display text-xl tabular-nums",
              done ? "text-accent" : "text-ink",
            )}
            // Announced only when it matters. A per-second live region would
            // read the countdown aloud continuously.
            aria-live={done ? "polite" : "off"}
          >
            {done ? "Rest done" : formatDuration(remaining)}
          </span>
          <span className="text-xs text-ink-muted">rest</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onExtend(30)}
            className="numeric h-9 rounded-lg border border-border px-3 text-sm active:bg-border/50"
          >
            +30s
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="h-9 rounded-lg px-3 text-sm text-ink-muted active:bg-border/50"
          >
            {done ? "Dismiss" : "Skip"}
          </button>
        </div>
      </div>

      {presetsOpen ? (
        <div className="mx-auto flex w-full max-w-[520px] gap-2 px-4 pb-3">
          {REST_PRESETS.map((seconds) => (
            <button
              key={seconds}
              type="button"
              onClick={() => {
                onRestart(seconds);
                setPresetsOpen(false);
              }}
              className={cn(
                "numeric h-11 flex-1 rounded-lg border text-sm active:bg-border/50",
                seconds === duration ? "border-accent text-accent" : "border-border text-ink-muted",
              )}
            >
              {formatDuration(seconds)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
