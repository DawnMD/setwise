/**
 * Rollback switches for the performance work.
 *
 * Each of these turns off one change and restores the behaviour that shipped
 * before it. They exist because batching, cookie-cached sessions and cache
 * patching each change something load-bearing in a way a staging environment
 * cannot fully rehearse: how a real browser behaves on a real connection when
 * something goes wrong.
 *
 * All default to on. A flag is set to "0", "false" or "off" to fall back, and
 * the intention is that all three are deleted a release after they land.
 */

const disabled = (value: string | undefined) =>
  value === "0" || value === "false" || value === "off";

const clientEnv: Record<string, string | undefined> =
  typeof import.meta !== "undefined" && import.meta.env
    ? (import.meta.env as unknown as Record<string, string | undefined>)
    : {};

/** Combine reads into one `/api/rpc/__batch__` request. */
export const BATCH_RPC = !disabled(clientEnv.VITE_ORPC_BATCH);

/**
 * Patch caches from mutation responses instead of invalidating and refetching.
 *
 * Off, every write goes back to the round trip it used to do. That is slower,
 * and it is also the safest thing to be able to reach for if a patched cache is
 * ever found showing something the server did not say.
 */
export const PATCH_CACHE = !disabled(clientEnv.VITE_CACHE_PATCHING);

/** Server-side. The signed session cookie cache in Better Auth. */
export const AUTH_COOKIE_CACHE = !disabled(
  typeof process !== "undefined" ? process.env.BETTER_AUTH_COOKIE_CACHE : undefined,
);
