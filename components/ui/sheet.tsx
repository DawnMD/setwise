"use client";

import { Drawer } from "@base-ui/react/drawer";
import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * The bottom sheet everything in the logger opens into.
 *
 * Built on Base UI's Drawer for the parts that are tedious and easy to get
 * wrong on a phone: focus trapping, the `aria-labelledby` wiring, scroll lock,
 * escape, and swipe-to-dismiss with a real velocity model.
 *
 * Never a centred modal. A sheet keeps its content in the bottom third of the
 * screen, which is the only part a thumb reaches.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  onOpenChangeComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fires after the slide-out finishes, so the caller can unmount cleanly. */
  onOpenChangeComplete?: (open: boolean) => void;
  title: React.ReactNode;
  /** Rendered under the title. Screen readers get it either way. */
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
      <Drawer.Portal>
        <Drawer.Backdrop
          className={cn(
            "fixed inset-0 min-h-dvh bg-black opacity-[calc(0.35*(1-var(--drawer-swipe-progress)))]",
            "transition-opacity duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
            "data-swiping:duration-0 data-starting-style:opacity-0 data-ending-style:opacity-0",
            "data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)]",
            // iOS 26+ lets content sit under the browser chrome, and a fixed
            // backdrop stops short of the visual viewport there.
            "supports-[-webkit-touch-callout:none]:absolute",
          )}
        />
        <Drawer.Viewport className="fixed inset-0 flex items-end justify-center">
          <Drawer.Popup
            className={cn(
              // The bleed is dead space below the sheet that stays filled while
              // it rubber-bands, so an overscroll never shows the page through
              // a gap at the bottom edge.
              "-mb-12 w-full max-w-[520px] rounded-t-2xl border-t border-border bg-surface-raised text-ink",
              "px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px)+3rem)]",
              "max-h-[calc(88dvh+3rem)] overflow-y-auto overscroll-contain touch-auto outline-none",
              "shadow-[0_-8px_32px_rgba(0,0,0,0.12)]",
              "[transform:translateY(var(--drawer-swipe-movement-y))]",
              "transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
              "data-swiping:select-none",
              "data-starting-style:[transform:translateY(calc(100%-3rem+2px))]",
              "data-ending-style:[transform:translateY(calc(100%-3rem+2px))]",
              "data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)]",
              className,
            )}
          >
            <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <Drawer.Content>
              <Drawer.Title className="text-base font-semibold">{title}</Drawer.Title>
              {description ? (
                <Drawer.Description className="mt-0.5 text-sm text-ink-muted">
                  {description}
                </Drawer.Description>
              ) : null}
              {children}
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export const SheetClose = Drawer.Close;
