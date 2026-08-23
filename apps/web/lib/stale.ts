/**
 * How long each kind of answer stays fresh.
 *
 * These are statements about the data, not about the network. Catalogue search
 * results describe 800 rows that change when someone writes a migration. An
 * open workout is patched directly by its own writes, so refetching it says
 * nothing the client did not already know.
 *
 * On its own rather than in `lib/queries` because the authenticated route's
 * guard needs one of these numbers and nothing else. Reaching it through the
 * query factories would pull the whole oRPC client into the entry chunk to
 * read a constant.
 */
export const STALE = {
  /**
   * The Home summary. Short, like the open workout it leads with: this is the
   * screen someone lands on after a workout finished in another tab, and the
   * first thing it says is whether one is still running.
   */
  home: 15_000,
  /** The exercise catalogue changes on deploy, not during a workout. */
  catalogue: 5 * 60_000,
  /** Volume, intensity and historical bodyweight: yesterday's numbers are settled. */
  stats: 5 * 60_000,
  /** Routine lists and rotation. Edited by hand, and rarely. */
  plans: 2 * 60_000,
  /** Whether a workout is open. Short, because the answer decides where a tap goes. */
  activeSession: 15_000,
  /**
   * An open workout's own detail. Every write patches it from the server's
   * response, so a refetch can only ever confirm what is already on screen.
   */
  openSession: Infinity,
  /** What was lifted last time. Cannot change while this session is open. */
  lastPerformance: Infinity,
  /** Targets and the trend weight, both patched by the writes that move them. */
  profile: 5 * 60_000,
  /** The authenticated route's own server guard. Matches the session cookie cache. */
  authRoute: 5 * 60_000,
} as const;
