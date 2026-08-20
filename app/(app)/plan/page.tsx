import type { Metadata } from "next";

import { PlanHome } from "@/components/plan/plan-home";

export const metadata: Metadata = { title: "Plan · Setwise" };

export default function PlanPage() {
  return <PlanHome />;
}
