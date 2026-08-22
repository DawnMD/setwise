import "@tanstack/react-start/server-only";

import { drizzle as neonDrizzle } from "drizzle-orm/neon-serverless";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";

import { requireEnv } from "./connection";
import { instrumentPool } from "./instrument";
import { createNeonPool, RUNTIME_POOL_MAX } from "./neon";
import * as schema from "./schema";

const connectionString = requireEnv("DATABASE_URL");

/**
 * The runtime pool.
 *
 * `DATABASE_URL` is the pooled Neon endpoint; the unpooled one is for
 * migrations and administrative tooling only, where a single long-lived
 * connection is what is wanted and PgBouncer is in the way.
 */
const createNeonDatabase = () =>
  neonDrizzle({
    client: instrumentPool(createNeonPool(connectionString, RUNTIME_POOL_MAX)),
    schema,
  });

export type Db = ReturnType<typeof createNeonDatabase>;
export const db: Db =
  process.env.DATABASE_DRIVER === "pg"
    ? (pgDrizzle({
        client: instrumentPool(new PgPool({ connectionString, max: RUNTIME_POOL_MAX })),
        schema,
      }) as unknown as Db)
    : createNeonDatabase();
export { schema };

/**
 * The database, or a transaction on it. Query helpers take this so they compose
 * inside `db.transaction(...)` without a second copy of each function.
 */
export type DbClient = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
