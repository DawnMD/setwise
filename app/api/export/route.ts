import { db } from "@/db";
import { auth } from "@/lib/auth";
import { exportSetsCsv } from "@/server/queries/export";

/**
 * A plain download rather than an RPC call.
 *
 * The browser needs a real response with `Content-Disposition` to save a file
 * without any client-side blob juggling, and a link that just works is the
 * point: without offline storage this file is the user's only backup, and the
 * best trust signal a fitness app can give is that their data leaves easily.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return new Response("Sign in to export your data.", { status: 401 });
  }

  const csv = await exportSetsCsv(db, session.user.id);
  const today = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="setwise-${today}.csv"`,
      "cache-control": "no-store",
    },
  });
}
