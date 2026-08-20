import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

/**
 * There is no marketing page. This app is a log, and the only useful thing to
 * show someone who opens it is either their workout or the sign-in form.
 */
export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  redirect(session ? "/train" : "/sign-in");
}
