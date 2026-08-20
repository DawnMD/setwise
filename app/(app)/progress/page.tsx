import type { Metadata } from "next";

import { ProgressHome } from "@/components/progress/progress-home";

export const metadata: Metadata = { title: "Progress · Setwise" };

export default function ProgressPage() {
  return <ProgressHome />;
}
