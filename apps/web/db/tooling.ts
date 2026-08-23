import { createRequire } from "node:module";

import { drizzle as neonDrizzle } from "drizzle-orm/neon-serverless";

import type { Db } from "./index";
import { createNeonPool } from "./neon";
import * as schema from "./schema";

type DatabaseClient = {
  end(): Promise<void>;
};

const require = createRequire(import.meta.url);

/**
 * CLI tools and integration tests use the native Neon driver by default. CI
 * opts into node-postgres so its disposable local Postgres service stays fully
 * isolated from hosted databases.
 */
export function openToolingDatabase(connectionString: string): {
  client: DatabaseClient;
  db: Db;
} {
  if (process.env.DATABASE_DRIVER === "pg") {
    const { Pool } = require("pg") as typeof import("pg");
    const { drizzle } =
      require("drizzle-orm/node-postgres") as typeof import("drizzle-orm/node-postgres");
    const client = new Pool({ connectionString, max: 1 });

    return {
      client,
      db: drizzle({ client, schema }) as unknown as Db,
    };
  }

  const client = createNeonPool(connectionString);
  return {
    client,
    db: neonDrizzle({ client, schema }),
  };
}
