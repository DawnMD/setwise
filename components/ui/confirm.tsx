"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import * as React from "react";

import { buttonClass } from "./button";

/**
 * A blocking question. Used for exactly two things: finishing a workout with
 * unsaved sets, and throwing a workout away.
 *
 * An alert dialog rather than a sheet, because both are decisions that must not
 * be dismissed by a stray swipe.
 */
export function Confirm({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Go back",
  destructive,
  onConfirm,
  extraAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  /** An escape hatch offered above the confirm, like "Retry all". */
  extraAction?: { label: string; onClick: () => void };
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 min-h-dvh bg-black opacity-40 transition-opacity duration-150 data-starting-style:opacity-0 data-ending-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
        <AlertDialog.Popup className="fixed bottom-0 left-1/2 w-full max-w-[520px] -translate-x-1/2 rounded-t-2xl border-t border-border bg-surface-raised p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] text-ink outline-none transition-transform duration-200 ease-out data-starting-style:translate-y-4 data-ending-style:translate-y-4">
          <AlertDialog.Title className="text-base font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-1 text-sm text-ink-muted">
            {description}
          </AlertDialog.Description>

          <div className="mt-4 flex flex-col gap-2">
            {extraAction ? (
              <button
                type="button"
                className={buttonClass("primary", "lg", "w-full")}
                onClick={extraAction.onClick}
              >
                {extraAction.label}
              </button>
            ) : null}
            <button
              type="button"
              className={buttonClass(
                destructive ? "danger" : extraAction ? "secondary" : "primary",
                "lg",
                "w-full",
              )}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
            <AlertDialog.Close className={buttonClass("ghost", "md", "w-full")}>
              {cancelLabel}
            </AlertDialog.Close>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
