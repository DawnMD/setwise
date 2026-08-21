import "@tanstack/react-start/server-only";

import { drizzle as neonDrizzle } from "drizzle-orm/neon-serverless";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";

import { requireEnv } from "./connection";
import { createNeonPool } from "./neon";
import * as schema from "./schema";

const connectionString = requireEnv("DATABASE_URL");
const createNeonDatabase = () => neonDrizzle({ client: createNeonPool(connectionString), schema });

export type Db = ReturnType<typeof createNeonDatabase>;
export const db: Db =
  process.env.DATABASE_DRIVER === "pg"
    ? (pgDrizzle({ client: new PgPool({ connectionString, max: 1 }), schema }) as unknown as Db)
    : createNeonDatabase();
export { schema };

/**
 * The database, or a transaction on it. Query helpers take this so they compose
 * inside `db.transaction(...)` without a second copy of each function.
 */
export type DbClient = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
