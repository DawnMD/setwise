import { config } from "dotenv";

import { seedDatabase } from "../src/seed";
import { openToolingDatabase } from "../src/tooling";

config({ path: ["../../apps/web/.env.local", "../../apps/web/.env"], quiet: true });

const pooledUrl = process.env.DATABASE_URL;
const directUrl = process.env.DATABASE_URL_UNPOOLED;
if (!pooledUrl && !directUrl) {
  throw new Error("Set DATABASE_URL_UNPOOLED or DATABASE_URL in apps/web/.env.local");
}

const connection = openToolingDatabase({
  pooledUrl: pooledUrl ?? directUrl!,
  directUrl,
  driver: process.env.DATABASE_DRIVER === "pg" ? "pg" : "neon",
});

try {
  await seedDatabase(connection.db, { log: console.log });
} finally {
  await connection.close();
}
