import { config } from "dotenv";

import { openToolingDatabase } from "../../db/tooling";

config({ path: ".env.local", quiet: true });

export function openTestDatabase() {
  const raw = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL in .env.local");
  }

  return openToolingDatabase(raw);
}
