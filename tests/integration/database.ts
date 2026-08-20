import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { parseConnectionString } from "../../db/connection";
import * as schema from "../../db/schema";

config({ path: ".env.local", quiet: true });

export function openTestDatabase() {
  const raw = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL in .env.local");
  }

  const { url, ssl } = parseConnectionString(raw);
  const client = postgres(url, { ssl, max: 1, onnotice: () => {} });

  return {
    client,
    db: drizzle(client, { schema }),
  };
}
