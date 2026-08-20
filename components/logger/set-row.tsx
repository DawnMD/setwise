"use client";

import { cn } from "@/lib/cn";
import { formatDelta, formatWeight } from "@/lib/format";
import { type Ghost, overloadDelta } from "@/lib/overload";

import type { LoggerSet, RowStatus } from "./types";

/**
 * One logged set.
 *
 * A failed save is this row turning red with a retry button on it, not a toast
 * that scrolls away. The worst thing this app could do is let someone finish a
 * workout believing it was recorded.
 */
export function SetRow({
  set,
  label,
  status,
  ghost,
  isPr,
  onEdit,
  onRetry,
  onDelete,
}: {
  set: LoggerSet;
  /** "1", "2" for working sets; "W" for warm-ups. */
  label: string;
  status: RowStatus;
  ghost: Ghost;
  isPr: boolean;
  onEdit: () => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const overload = set.isWarmup ? null : overloadDelta(set, ghost);
  const failed = status === "failed";

  return (
    <div
      className={cn(
        "flex min-h-12 items-center gap-3 rounded-lg px-2",
        failed && "border border-danger/50 bg-danger/5",
        status === "saving" && "opacity-60",
      )}
    >
      <span
        className={cn(
          "numeric flex size-7 shrink-0 items-center justify-center rounded-md text-xs",
          set.isWarmup ? "bg-border/60 text-ink-muted" : "bg-border/40 text-ink-muted",
        )}
      >
        {label}
      </span>

      <button
        type="button"
        onClick={failed ? onRetry : onEdit}
        className="flex flex-1 items-baseline gap-2 py-2 text-left"
      >
        <span className="numeric-display text-lg">
          {formatWeight(set.weight)}
          <span className="text-sm font-normal text-ink-muted"> kg</span> × {set.reps}
        </span>
        {set.rpe !== null ? (
          <span className="numeric text-xs text-ink-muted">@{set.rpe}</span>
        ) : null}
        {overload ? (
          <span className="numeric text-xs font-semibold text-accent">
            {overload.kind === "weight" ? formatDelta(overload.delta) : `+${overload.delta} rep`}
          </span>
        ) : null}
        {isPr ? (
          <span className="rounded-sm bg-pr/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-pr uppercase">
            PR
          </span>
        ) : null}
      </button>

      {failed ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onRetry}
            className="h-9 rounded-md px-2 text-sm font-medium text-danger active:bg-danger/10"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Discard this set"
            className="h-9 rounded-md px-2 text-sm text-ink-muted active:bg-border/50"
          >
            Discard
          </button>
        </div>
      ) : status === "saving" ? (
        <span className="shrink-0 text-xs text-ink-muted">Saving…</span>
      ) : null}
    </div>
  );
}

/** The one line that explains a red row, placed under the block it belongs to. */
export function FailedSetsNotice({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <p className="px-2 py-1 text-xs text-danger">
      {count === 1 ? "1 set didn't save." : `${count} sets didn't save.`} Tap it to retry.
    </p>
  );
}
