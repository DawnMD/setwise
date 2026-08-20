import { db } from "@/db";
import { auth } from "@/lib/auth";
import { exportBodyweightCsv, exportSetsCsv } from "@/server/queries/export";

/**
 * A plain download rather than an RPC call.
 *
 * The browser needs a real response with `Content-Disposition` to save a file
 * without any client-side blob juggling, and a link that just works is the
 * point: without offline storage this file is the user's only backup, and the
 * best trust signal a fitness app can give is that their data leaves easily.
 *
 * Two datasets, one per request, because a set and a weigh-in are different
 * shapes and merging them would leave most of a column blank in whichever
 * spreadsheet someone opens it in.
 */
const DATASETS = {
  sets: { export: exportSetsCsv, slug: "sets" },
  bodyweight: { export: exportBodyweightCsv, slug: "bodyweight" },
} as const;

type Dataset = keyof typeof DATASETS;

function isDataset(value: string): value is Dataset {
  return value in DATASETS;
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response("Sign in to export your data.", { status: 401 });
  }

  // Unnamed means sets, so the link phase 1 shipped keeps working untouched.
  const requested = new URL(request.url).searchParams.get("data") ?? "sets";
  if (!isDataset(requested)) {
    return new Response("Unknown dataset.", { status: 400 });
  }

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
