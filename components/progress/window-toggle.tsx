"use client";

import { STAT_WINDOWS, type StatWindow } from "@/db/validators";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * 7, 30 or 90 days. One toggle governs the whole screen, and phase 4's
 * bodyweight chart reads the same three, so the window means one thing
 * everywhere in the app rather than one thing per screen.
 */
export function WindowToggle({
  value,
  onChange,
}: {
  value: StatWindow;
  onChange: (window: StatWindow) => void;
}) {
  return (
    <ToggleGroup
      variant="outline"
      value={[String(value)]}
      onValueChange={([next]: string[]) => {
        if (!next) return;
        onChange(Number(next) as StatWindow);
      }}
      aria-label="Window"
      className="w-full"
    >
      {STAT_WINDOWS.map((days) => (
        <ToggleGroupItem key={days} value={String(days)} className="numeric h-11 flex-1">
          {days}d
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
