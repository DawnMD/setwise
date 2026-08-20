import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { BottomNav } from "@/components/bottom-nav";

/**
 * Everything behind the sign-in wall. The check is here rather than in each
 * page so a new screen is protected by where it lives, not by remembering to
 * add a guard.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  return (
    <>
      <main className="flex flex-1 flex-col">{children}</main>
      <BottomNav />
    </>
  );
}
