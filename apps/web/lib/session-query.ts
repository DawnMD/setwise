import { getCurrentSession } from "@/src/server/session.functions";
import { STALE } from "./stale";

/** The one cache entry the route guard reads. Cleared on sign-in and sign-out. */
export const AUTH_SESSION_KEY = ["auth", "session"] as const;

/**
 * The authenticated boundary's own guard, held in the query cache.
 *
 * `beforeLoad` runs on every navigation, and each run was a server function
 * call that resolved the session again — a Singapore round trip in front of
 * every tap on the bottom nav, before any of the screen's own data started
 * loading. Five minutes of freshness collapses that to one call per session.
 *
 * The window is the same five minutes as the signed session cookie cache, and
 * for the same reason: both are bets that a session revoked elsewhere can be
 * honoured a little late. Signing out does not wait, because it clears this
 * cache in the same handler that clears the cookie.
 */
export const authSessionQuery = {
  queryKey: AUTH_SESSION_KEY,
  queryFn: () => getCurrentSession(),
  staleTime: STALE.authRoute,
  /**
   * Without this, `ensureQueryData` returns whatever it has and never looks
   * again — the window would not be five minutes, it would be the lifetime of
   * the tab, and a session revoked elsewhere would go unnoticed until a reload.
   *
   * With it, a navigation past the window still commits immediately on the
   * cached answer and re-resolves behind it, so the cost lands on a background
   * request rather than on the tap.
   */
  revalidateIfStale: true,
};
