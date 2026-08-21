import { Monitor, Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const THEMES = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

/**
 * Three choices rather than a switch, because "system" is a real answer and a
 * two-state switch cannot express it. Gym lighting is unpredictable enough that
 * the phone's own guess is usually right, so that stays the default.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <ToggleGroup
      variant="outline"
      spacing={0}
      value={[theme ?? "system"]}
      onValueChange={([next]) => {
        if (next === "system" || next === "light" || next === "dark") setTheme(next);
      }}
      aria-label="Theme"
      className="w-full"
    >
      {THEMES.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-label={option.label}
          className="h-11 flex-1"
        >
          <option.icon data-icon="inline-start" />
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
