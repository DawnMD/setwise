import { oc } from "@orpc/contract";

export const publicContract = oc;

export const protectedContract = publicContract.errors({
  UNAUTHORIZED: {
    message: "Sign in to continue.",
  },
});
