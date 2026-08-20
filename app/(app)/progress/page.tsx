import type { Metadata } from "next";

export const metadata: Metadata = { title: "Progress · Setwise" };

/**
 * Phase 3. Empty states give an instruction, not a mood, and the honest
 * instruction here is "there is nothing to show you yet, and here is why".
 */
export default function ProgressPage() {
  return (
    <div className="mx-auto w-full max-w-[520px] px-4 py-4">
      <h1 className="py-2 text-2xl font-semibold tracking-tight">Progress</h1>
      <p className="mt-2 text-sm text-ink-muted">
        The heatmap, per-muscle volume and e1RM trends land in phase 3. Keep logging: this screen
        reads the sets you record now, so the history is worth more the earlier you start.
      </p>
    </div>
  );
}
