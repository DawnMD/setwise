import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db, schema } from "@/db";

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

  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
