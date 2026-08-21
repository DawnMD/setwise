import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import * as React from "react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function SignOutButton() {
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
        queryClient.clear();
        await router.invalidate();
        await navigate({ to: "/sign-in", replace: true });
      }}
    >
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
