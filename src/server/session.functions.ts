import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

export const getCurrentSession = createServerFn({ method: "GET" }).handler(async () => {
  const { auth } = await import("@/lib/auth");
  return auth.api.getSession({ headers: getRequestHeaders() });
});
