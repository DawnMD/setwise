import { createFileRoute } from "@tanstack/react-router";

import { db } from "@/db";
import { auth } from "@/lib/auth";
import { exportBodyweightCsv, exportHabitsCsv, exportSetsCsv } from "@/server/queries/export";

const DATASETS = {
  sets: { export: exportSetsCsv, slug: "sets" },
  bodyweight: { export: exportBodyweightCsv, slug: "bodyweight" },
  habits: { export: exportHabitsCsv, slug: "habits" },
} as const;

type Dataset = keyof typeof DATASETS;

function isDataset(value: string): value is Dataset {
  return value in DATASETS;
}

async function handleExport(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response("Sign in to export your data.", { status: 401 });

  const requested = new URL(request.url).searchParams.get("data") ?? "sets";
  if (!isDataset(requested)) return new Response("Unknown dataset.", { status: 400 });

  const dataset = DATASETS[requested];
  const csv = await dataset.export(db, session.user.id);
  const today = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="setwise-${dataset.slug}-${today}.csv"`,
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/export")({
  server: { handlers: { GET: ({ request }) => handleExport(request) } },
});
