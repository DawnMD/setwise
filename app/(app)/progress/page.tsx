import { ChartNoAxesColumn } from "lucide-react";
import type { Metadata } from "next";

import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const metadata: Metadata = { title: "Progress · Setwise" };

/**
 * Phase 3. Empty states give an instruction, not a mood, and the honest
 * instruction here is "there is nothing to show you yet, and here is why".
 */
export default function ProgressPage() {
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-1 flex-col px-4 py-4">
      <h1 className="py-2 font-heading text-2xl font-semibold tracking-tight">Progress</h1>

      <Empty className="border">
        <EmptyMedia variant="icon">
          <ChartNoAxesColumn />
        </EmptyMedia>
        <EmptyTitle>Nothing to show yet</EmptyTitle>
        <EmptyDescription>
          The heatmap, per-muscle volume and e1RM trends land in phase 3. Keep logging: this screen
          reads the sets you record now, so the history is worth more the earlier you start.
        </EmptyDescription>
      </Empty>
    </div>
  );
}
