import { config } from "dotenv";
import { count } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "../src/schema";
import { openToolingDatabase } from "../src/tooling";

config({ path: ["../../apps/web/.env.local", "../../apps/web/.env"], quiet: true });

const pooledUrl = process.env.DATABASE_URL;
const directUrl = process.env.DATABASE_URL_UNPOOLED;
const configured = Boolean(pooledUrl || directUrl);
const databaseSuite = configured ? describe : describe.skip;

databaseSuite("database package", () => {
  let connection: ReturnType<typeof openToolingDatabase>;

  beforeAll(() => {
    connection = openToolingDatabase({
      pooledUrl: pooledUrl ?? directUrl!,
      directUrl,
      driver: process.env.DATABASE_DRIVER === "pg" ? "pg" : "neon",
    });
  });

  afterAll(async () => {
    await connection.close();
  });

  it("connects through the configured driver and reads the migrated schema", async () => {
    const [row] = await connection.db.select({ value: count() }).from(schema.user);
    expect(row?.value).toBeGreaterThanOrEqual(0);
  });
});
