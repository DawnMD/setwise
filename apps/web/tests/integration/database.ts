import { config } from "dotenv";

import { openToolingDatabase } from "../../db/tooling";

config({ path: ".env.local", quiet: true });

export type TestDatabase = ReturnType<typeof openToolingDatabase>;

export function openTestDatabase(): TestDatabase {
  const raw = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL in .env.local");
  }

  return openToolingDatabase(raw);
}

let shared: TestDatabase | undefined;

/**
 * The database handed to the app once a test mocks `@/db`. A test that drives
 * the router needs the router to read and write through the same connection it
 * asserts on, and a single instance keeps one `client.end()` enough to close it.
 */
export function openSharedTestDatabase(): TestDatabase {
  shared ??= openTestDatabase();
  return shared;
}
