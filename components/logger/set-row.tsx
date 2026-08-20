"use client";

import { cn } from "@/lib/utils";
import { formatDelta, formatWeight } from "@/lib/format";
import { type Ghost, overloadDelta } from "@/lib/overload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemMedia } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";

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
    <Item
      size="xs"
      variant={failed ? "outline" : "default"}
      className={cn(
        "min-h-12",
        failed && "border-destructive/50 bg-destructive/5",
        status === "saving" && "opacity-60",
      )}
    >
      <ItemMedia>
        <Badge variant="secondary" className="numeric size-7 rounded-full px-0">
          {label}
        </Badge>
      </ItemMedia>

      <ItemContent>
        <button
          type="button"
          onClick={failed ? onRetry : onEdit}
          className="flex flex-wrap items-baseline gap-2 py-1 text-left"
        >
          <span className="numeric-display text-lg text-foreground">
            {formatWeight(set.weight)}
            <span className="text-sm font-normal text-muted-foreground"> kg</span> × {set.reps}
          </span>
          {set.rpe !== null ? (
            <span className="numeric text-xs text-muted-foreground">@{set.rpe}</span>
          ) : null}
          {overload ? (
            <Badge variant="overload" className="numeric">
              {overload.kind === "weight" ? formatDelta(overload.delta) : `+${overload.delta} rep`}
            </Badge>
          ) : null}
          {isPr ? <Badge variant="pr">PR</Badge> : null}
        </button>
      </ItemContent>

      {failed ? (
        <ItemActions>
          <Button variant="destructive" size="sm" onClick={onRetry}>
            Retry
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} aria-label="Discard this set">
            Discard
          </Button>
        </ItemActions>
      ) : status === "saving" ? (
        <ItemActions>
          <Spinner className="text-muted-foreground" />
        </ItemActions>
      ) : null}
    </Item>
  );
}
