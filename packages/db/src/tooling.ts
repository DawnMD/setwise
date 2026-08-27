import {
  createDatabase,
  TOOLING_POOL_MAX,
  type Database,
  type DatabaseDriver,
  type DatabaseOptions,
} from "./index";

type CloseableDatabase = {
  db: Database;
  /** @deprecated Prefer close(). Kept for existing integration-test cleanup. */
  client: { end(): Promise<void> };
  close(): Promise<void>;
};

/** Opens a single-connection database for migrations, seeds, and tests. */
export function openToolingDatabase(options: DatabaseOptions): CloseableDatabase {
  let close: (() => Promise<void>) | undefined;
  const db = createDatabase({
    ...options,
    pooledUrl: options.directUrl ?? options.pooledUrl,
    maxConnections: TOOLING_POOL_MAX,
    configurePool: (pool) => {
      close = () => (pool as { end(): Promise<void> }).end();
      return pool;
    },
  });

  const end = () => close?.() ?? Promise.resolve();
  return { db, client: { end }, close: end };
}

/** Compatibility helper for callers that already resolved one URL. */
export function openDatabaseUrl(url: string, driver: DatabaseDriver = "neon") {
  return openToolingDatabase({ pooledUrl: url, driver });
}
