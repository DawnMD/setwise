import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 30_000,
    // Unit tests alongside the integration suite rather than in their own
    // runner: they are the same language, the same aliases and the same
    // command, and a second config is a second thing to keep in step.
    include: ["tests/integration/**/*.test.ts", "tests/unit/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
