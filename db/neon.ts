import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

// Node.js does not expose WebSocket in every supported runtime. Supplying the
// constructor keeps Neon's transaction-capable driver consistent in dev,
// tests, and deployed server functions.
neonConfig.webSocketConstructor = ws;

export function createNeonPool(connectionString: string) {
  return new Pool({ connectionString, max: 1 });
}
