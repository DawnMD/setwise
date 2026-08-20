import type { Metadata } from "next";

import { TrainHome } from "@/components/logger/train-home";

export const metadata: Metadata = { title: "Train · Setwise" };

export default function TrainPage() {
  return <TrainHome />;
}
