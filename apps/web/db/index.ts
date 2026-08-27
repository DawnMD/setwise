import "@tanstack/react-start/server-only";

import { attachDatabasePool } from "@vercel/functions/db-connections";
import { createDatabase, type DatabaseGauges } from "@setwise/db";

import { recordProcedureLatency } from "@/server/metrics";
import { addTiming } from "@/server/timing";
import { requireEnv } from "./connection";

const pooledUrl = requireEnv("DATABASE_URL");

function attachRuntimePool<T extends object>(pool: T): T {
  if (process.env.VERCEL === "1") {
    attachDatabasePool(pool as Parameters<typeof attachDatabasePool>[0]);
  }
  return pool;
}

function recordAcquire(durationMs: number, gauges: DatabaseGauges) {
  recordProcedureLatency("db.acquire", durationMs, gauges);
}

export const db = createDatabase({
  pooledUrl,
  directUrl: process.env.DATABASE_URL_UNPOOLED,
  driver: process.env.DATABASE_DRIVER === "pg" ? "pg" : "neon",
  configurePool: attachRuntimePool,
  instrumentation: {
    recordQuery: (durationMs) => addTiming("db", durationMs),
    recordAcquire,
  },
});

export type { Database as Db, DbClient } from "@setwise/db";
export { schema } from "@setwise/db";
