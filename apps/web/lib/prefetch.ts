import type * as Queries from "./queries";

/**
 * Runs a route loader's prefetching, in the browser, off a chunk of its own.
 *
 * Two problems, one answer.
 *
 * A route's loader is part of the route tree, which is part of the entry chunk,
 * and it cannot be moved out of it: grouping the loader with the component
 * makes the server load the component's chunk to run the loader, and TanStack's
 * streaming render fails on the boundary that creates. So the loader stays where
 * it is, and reaches the query factories — and through them the whole oRPC
 * client — behind a dynamic import instead. That chunk is the same one the
 * screen itself imports, so it is already being fetched alongside it rather
 * than in front of it.
 *
 * The guard is the second half. Authenticated routes are data-only SSR: the
 * loader runs on the server too, where the oRPC client is browser-only by
 * design and there is nothing to warm anyway.
 */
export async function prefetch(
  run: (queries: typeof Queries) => void | Promise<void>,
): Promise<void> {
  if (typeof window === "undefined") return;
  await run(await import("./queries"));
}
