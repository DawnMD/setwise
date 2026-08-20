import type { Metadata } from "next";

import { RoutineEditor } from "@/components/plan/routine-editor";

export const metadata: Metadata = { title: "Routine · Setwise" };

export default async function RoutinePage({ params }: PageProps<"/plan/[routineId]">) {
  const { routineId } = await params;
  return <RoutineEditor routineId={routineId} />;
}
