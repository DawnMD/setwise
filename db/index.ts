import "@tanstack/react-start/server-only";

import { attachDatabasePool } from "@vercel/functions/db-connections";
import { drizzle as neonDrizzle } from "drizzle-orm/neon-serverless";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";

import { requireEnv } from "./connection";
import { instrumentPool } from "./instrument";
import { createNeonPool, RUNTIME_POOL_MAX } from "./neon";
import * as schema from "./schema";

const connectionString = requireEnv("DATABASE_URL");

/**
 * Keep Vercel invocations alive until a runtime pool has released idle clients.
 * Local development and CI have no Vercel request context, so registering there
 * would only produce warnings when a client is released.
 */
function attachRuntimePool<T extends Parameters<typeof attachDatabasePool>[0]>(pool: T): T {
  if (process.env.VERCEL === "1") attachDatabasePool(pool);
  return pool;
}

/**
 * The runtime pool.
 *
 * `DATABASE_URL` is the pooled Neon endpoint; the unpooled one is for
 * migrations and administrative tooling only, where a single long-lived
 * connection is what is wanted and PgBouncer is in the way.
 */
const createNeonDatabase = () =>
  neonDrizzle({
    client: instrumentPool(attachRuntimePool(createNeonPool(connectionString, RUNTIME_POOL_MAX))),
    schema,
  });

export type Db = ReturnType<typeof createNeonDatabase>;
export const db: Db =
  process.env.DATABASE_DRIVER === "pg"
    ? (pgDrizzle({
        client: instrumentPool(
          attachRuntimePool(new PgPool({ connectionString, max: RUNTIME_POOL_MAX })),
        ),
        schema,
      }) as unknown as Db)
    : createNeonDatabase();
export { schema };

/**
 * The database, or a transaction on it. Query helpers take this so they compose
 * inside `db.transaction(...)` without a second copy of each function.
 */
export type DbClient = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
