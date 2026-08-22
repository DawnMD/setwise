import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

// Node.js does not expose WebSocket in every supported runtime. Supplying the
// constructor keeps Neon's transaction-capable driver consistent in dev,
// tests, and deployed server functions.
neonConfig.webSocketConstructor = ws;

/**
 * How many connections one runtime instance may hold.
 *
 * One was safe and serial: two reads on the same screen queued behind each
 * other for the whole round trip to Singapore, which is exactly the shape of
 * the train screen. Five is enough to run a batched read concurrently without
 * multiplying Neon's pooler by every warm function instance.
 */
export const RUNTIME_POOL_MAX = 5;

/** Tools and tests open one connection and close it. Nothing there is concurrent. */
export const TOOLING_POOL_MAX = 1;

export function createNeonPool(connectionString: string, max: number = TOOLING_POOL_MAX) {
  return new Pool({ connectionString, max });
}
