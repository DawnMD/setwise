import { formatDelta, formatWeight } from "@/lib/format";
import { type Ghost, overloadDelta } from "@/lib/overload";
import { Badge } from "@/components/ui/badge";
import { Item, ItemContent, ItemMedia } from "@/components/ui/item";

import type { LoggerSet } from "./types";

/**
 * One logged set.
 *
 * Rows only exist after the server has confirmed the write.
 */
export function SetRow({
  set,
  label,
  ghost,
  isPr,
  onEdit,
}: {
  set: LoggerSet;
  /** "1", "2" for working sets; "W" for warm-ups. */
  label: string;
  ghost: Ghost;
  isPr: boolean;
  onEdit: () => void;
}) {
  const overload = set.isWarmup ? null : overloadDelta(set, ghost);

  return (
    <Item size="xs" className="min-h-12">
      <ItemMedia>
        <Badge variant="secondary" className="numeric size-7 px-0">
          {label}
        </Badge>
      </ItemMedia>

      <ItemContent>
        <button
          type="button"
          onClick={onEdit}
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
    </Item>
  );
}
