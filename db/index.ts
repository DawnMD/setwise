import { drizzle } from "drizzle-orm/neon-serverless";

import { requireEnv } from "./connection";
import { createNeonPool } from "./neon";
import * as schema from "./schema";

/**
 * The application uses Neon's pooled endpoint. The module-level pool can be
 * reused when a serverless instance handles more than one request.
 */
const client = createNeonPool(requireEnv("DATABASE_URL"));

export const db = drizzle({ client, schema });
export type Db = typeof db;
export { schema };

/**
 * The database, or a transaction on it. Query helpers take this so they compose
 * inside `db.transaction(...)` without a second copy of each function.
 */
export type DbClient = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
