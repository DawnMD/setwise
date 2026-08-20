"use client";

import { Switch as BaseSwitch } from "@base-ui/react/switch";

import { cn } from "@/lib/cn";

/** A 44px-tall hit area around a smaller track, because thumbs are imprecise. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <label className={cn("flex h-11 cursor-pointer items-center gap-3 select-none", className)}>
      <BaseSwitch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full border border-border bg-border/60 transition-colors",
          "data-checked:border-accent data-checked:bg-accent",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        )}
      >
        <BaseSwitch.Thumb
          className={cn(
            "block size-5 rounded-full bg-surface-raised shadow-sm transition-transform",
            "translate-x-0.5 data-checked:translate-x-[1.125rem]",
          )}
        />
      </BaseSwitch.Root>
      <span className="text-[15px]">{label}</span>
    </label>
  );
}
