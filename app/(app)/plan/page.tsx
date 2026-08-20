import type { Metadata } from "next";

export const metadata: Metadata = { title: "Plan · Setwise" };

/** Phase 2. Until then every workout is ad hoc, which the logger handles fine. */
export default function PlanPage() {
  return (
    <div className="mx-auto w-full max-w-[520px] px-4 py-4">
      <h1 className="py-2 text-2xl font-semibold tracking-tight">Plan</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Routines land in phase 2. For now, start an empty workout and add exercises as you go —
        last session&apos;s numbers show up either way.
      </p>
    </div>
  );
}
