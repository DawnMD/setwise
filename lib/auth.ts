import "@tanstack/react-start/server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { db, schema } from "@/db";
import { AUTH_COOKIE_CACHE } from "./flags";

function hostFromEnvironment(value: string | undefined) {
  if (!value) return undefined;

  return new URL(value.includes("://") ? value : `https://${value}`).host;
}

const allowedAuthHosts = Array.from(
  new Set(
    [
      "localhost:*",
      "127.0.0.1:*",
      hostFromEnvironment(process.env.BETTER_AUTH_URL),
      hostFromEnvironment(process.env.VERCEL_URL),
      hostFromEnvironment(process.env.VERCEL_BRANCH_URL),
      hostFromEnvironment(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    ].filter((host): host is string => Boolean(host)),
  ),
);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: process.env.BETTER_AUTH_SECRET,
  // Resolve the origin per request so Vercel previews and production aliases
  // generate callbacks for the domain the user actually opened. Better Auth
  // also adds these hosts to trustedOrigins and rejects every other host.
  baseURL: {
    allowedHosts: allowedAuthHosts,
    protocol: "auto",
  },

  // Email and password only for the MVP. An OAuth provider slots in here later
  // without touching the schema beyond what `account` already stores.
  emailAndPassword: { enabled: true },

  /**
   * The signed session cookie cache.
   *
   * Every protected procedure resolved the session by querying Postgres, which
   * put a Singapore round trip in front of every read on every screen. The
   * cache moves that to a signature check against a cookie the browser already
   * sent.
   *
   * Five minutes is the revocation window this buys itself with: a session
   * revoked on another device stays usable here for up to that long. Sign-out
   * is not affected — Better Auth clears the cache cookie in the same response
   * that clears the session cookie, so the tab that signed out is locked out at
   * once. The window only applies to a revocation the browser never saw.
   */
  session: {
    cookieCache: {
      enabled: AUTH_COOKIE_CACHE,
      maxAge: 5 * 60,
      strategy: "compact",
    },
  },

  user: {
    additionalFields: {
      // The plan's `users.unit_pref`. Everything is stored in kg; this is a
      // display preference only, so a bad value can never corrupt a set.
      unitPref: {
        type: "string",
        required: false,
        defaultValue: "kg",
        input: true,
      },
      // Phase 5 sends friend requests by username. Cheap to carry from day one,
      // expensive to backfill once people have accounts.
      username: {
        type: "string",
        required: false,
        input: true,
      },
    },
  },

  plugins: [tanstackStartCookies()],
});

export type Session = typeof auth.$Infer.Session;
