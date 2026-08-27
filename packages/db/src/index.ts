import { neonConfig, Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as neonDrizzle } from "drizzle-orm/neon-serverless";
import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import ws from "ws";

import { instrumentPool, type DatabaseInstrumentation } from "./instrument";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

export const RUNTIME_POOL_MAX = 5;
export const TOOLING_POOL_MAX = 1;

export type DatabaseDriver = "neon" | "pg";
export type { DatabaseGauges, DatabaseInstrumentation } from "./instrument";

export type DatabaseOptions = {
  pooledUrl: string;
  directUrl?: string;
  driver: DatabaseDriver;
};

export type DatabaseRuntimeOptions = DatabaseOptions & {
  maxConnections?: number;
  configurePool?: <T extends object>(pool: T) => T;
  instrumentation?: DatabaseInstrumentation;
};

function createNeonDatabase(options: DatabaseRuntimeOptions) {
  const rawPool = new NeonPool({
    connectionString: options.pooledUrl,
    max: options.maxConnections ?? RUNTIME_POOL_MAX,
  });
  const configured = options.configurePool ? options.configurePool(rawPool) : rawPool;
  return neonDrizzle({
    client: instrumentPool(configured, options.instrumentation),
    schema,
  });
}

export type Database = ReturnType<typeof createNeonDatabase>;
export type Db = Database;

export function createDatabase(options: DatabaseRuntimeOptions): Database {
  if (options.driver === "pg") {
    const rawPool = new PgPool({
      connectionString: options.pooledUrl,
      max: options.maxConnections ?? RUNTIME_POOL_MAX,
    });
    const configured = options.configurePool ? options.configurePool(rawPool) : rawPool;
    return pgDrizzle({
      client: instrumentPool(configured, options.instrumentation),
      schema,
    }) as unknown as Database;
  }

  return createNeonDatabase(options);
}

export { schema };

/** A database or a transaction opened from it. */
export type DbClient = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
