"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  return (
    <Button
      variant="outline"
      size="touch"
      className="w-full"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.replace("/sign-in");
        router.refresh();
      }}
    >
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
