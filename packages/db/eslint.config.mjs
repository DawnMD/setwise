import { defineConfig, globalIgnores } from "eslint/config";

import base from "@setwise/eslint-config/base";
import { boundaries } from "@setwise/eslint-config/boundaries";
import globals from "globals";

export default defineConfig(
  ...base,
  ...boundaries("@setwise/db"),
  globalIgnores(["data/**", "drizzle/**"]),
  {
    files: ["drizzle.config.ts", "scripts/**/*.ts", "tests/**/*.ts"],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
    rules: {
      // Database URLs are resolved only by command-line adapters. Runtime
      // package code receives explicit DatabaseOptions and never reads env.
      "no-restricted-globals": "off",
    },
  },
);
