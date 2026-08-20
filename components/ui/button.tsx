import * as React from "react";

import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

/**
 * 44px is the floor on every size except `sm`, which is only ever used for
 * controls that sit inside a row you are not aiming at with a chalky thumb.
 */
const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-[15px]",
  lg: "h-14 px-5 text-base",
};

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink active:bg-accent/85",
  secondary: "border border-border bg-surface-raised text-ink active:bg-border/40",
  ghost: "text-ink-muted active:bg-border/40",
  danger: "border border-danger/40 text-danger active:bg-danger/10",
};

export type ButtonProps = React.ComponentPropsWithRef<"button"> & {
  variant?: Variant;
  size?: Size;
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium select-none",
    "transition-colors disabled:opacity-40 disabled:pointer-events-none",
    // The only focus treatment in the app. There is no hover on a phone, so
    // hover states are left to carry nothing.
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    SIZES[size],
    VARIANTS[variant],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonProps) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}
