import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { parseConnectionString, requireEnv } from "./connection";
import * as schema from "./schema";

const { url, ssl } = parseConnectionString(requireEnv("DATABASE_URL"));

/**
 * One connection per serverless invocation. `prepare: false` because the pooled
 * Neon endpoint runs in transaction mode, where prepared statements don't
 * survive between checkouts.
 */
const client = postgres(url, { ssl, max: 1, prepare: false });

export const db = drizzle(client, { schema });
export type Db = typeof db;
export { schema };
