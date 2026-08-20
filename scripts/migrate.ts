import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { parseConnectionString } from "../db/connection";

config({ path: ".env.local", quiet: true });

async function main() {
  const raw = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!raw) throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL in .env.local");

  const { url, ssl } = parseConnectionString(raw);
  const client = postgres(url, { ssl, max: 1, onnotice: () => {} });

  try {
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    console.log("migrations applied");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
