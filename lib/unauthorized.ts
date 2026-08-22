type UnauthorizedHandler = () => void;

let handler: UnauthorizedHandler | null = null;

/**
 * One place that decides what an expired session means.
 *
 * Before this, an UNAUTHORIZED surfaced as a failed query on whichever screen
 * happened to ask first, leaving a signed-out user looking at a retry button
 * for a request that was never going to succeed. The app root registers the
 * handler, because it is the only component that outlives every route.
 *
 * A module of its own, with no imports: the root document registers the handler
 * and the RPC link calls it, and neither should have to pull the other's
 * dependencies into the entry chunk to say so.
 */
export function setUnauthorizedHandler(next: UnauthorizedHandler | null): void {
  handler = next;
}

export function reportUnauthorized(): void {
  handler?.();
}
