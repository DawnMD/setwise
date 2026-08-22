import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as React from "react";

import { authClient } from "@/lib/auth-client";
import { clearAccountCache } from "@/lib/cache";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function SignOutButton() {
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
        // Clearing the cache takes the route guard's cached session with it, so
        // the next protected route resolves against the server and finds the
        // cookie gone. That is what makes signing out immediate rather than
        // something the five-minute session cache can outlive.
        clearAccountCache(queryClient);
        await navigate({ to: "/sign-in", replace: true });
      }}
    >
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
