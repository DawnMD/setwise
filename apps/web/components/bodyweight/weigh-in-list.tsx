import * as React from "react";

import { formatWeight, formatWhen, parseIsoDay } from "@/lib/format";
import { Button } from "@/components/ui/button";

import type { WeighIn } from "./bodyweight-sheet";

/** Enough to check this week at a glance without scrolling a quarter of them. */
const COLLAPSED = 5;

/**
 * The weigh-ins behind the line, most recent first.
 *
 * Rows are buttons because the fix for a fat-fingered 828 has to be reachable
 * from where you notice it. Tapping one reopens it in the same sheet it was
 * logged in, where it can be corrected or deleted.
 */
export function WeighInList({
  weighIns,
  onEdit,
}: {
  weighIns: WeighIn[];
  onEdit: (weighIn: WeighIn) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const newestFirst = [...weighIns].reverse();
  const shown = expanded ? newestFirst : newestFirst.slice(0, COLLAPSED);

  return (
    <div className="flex flex-col">
      <ul className="flex flex-col divide-y rounded-none border">
        {shown.map((weighIn) => (
          <li key={weighIn.loggedOn}>
            <button
              type="button"
              onClick={() => onEdit(weighIn)}
              className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left"
            >
              <span className="flex min-w-0 flex-col">
                <span className="text-sm">{formatWhen(parseIsoDay(weighIn.loggedOn))}</span>
                {weighIn.note ? (
                  <span className="truncate text-xs text-muted-foreground">{weighIn.note}</span>
                ) : null}
              </span>
              <span className="numeric shrink-0 text-sm">
                {weighIn.weight === null ? "—" : `${formatWeight(weighIn.weight)} kg`}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {newestFirst.length > COLLAPSED ? (
        <Button
          variant="ghost"
          size="touch"
          className="w-full text-muted-foreground"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show fewer" : `Show all ${newestFirst.length} weigh-ins`}
        </Button>
      ) : null}
    </div>
  );
}
