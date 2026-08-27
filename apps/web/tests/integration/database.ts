import { config } from "dotenv";

import { openToolingDatabase } from "@setwise/db/tooling";

config({ path: ".env.local", quiet: true });

export type TestDatabase = ReturnType<typeof openToolingDatabase>;

export function openTestDatabase(): TestDatabase {
  const pooledUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DATABASE_URL_UNPOOLED;
  if (!pooledUrl && !directUrl) {
    throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL in .env.local");
  }

  return openToolingDatabase({
    pooledUrl: pooledUrl ?? directUrl!,
    directUrl,
    driver: process.env.DATABASE_DRIVER === "pg" ? "pg" : "neon",
  });
}

let shared: TestDatabase | undefined;

/**
 * The database injected into an API router under test. The router must read and
 * write through the same connection the test asserts on, and a single instance
 * keeps one `client.end()` enough to close it.
 */
export function openSharedTestDatabase(): TestDatabase {
  shared ??= openTestDatabase();
  return shared;
}
