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
export { STALE } from "@setwise/api-client";
