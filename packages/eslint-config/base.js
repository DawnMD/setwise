import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import tseslint from "typescript-eslint";

/**
 * Everything every Setwise workspace lints for, and nothing platform-specific.
 *
 * Platform globals and UI rules live in `./web.js` and `./react-native.js`.
 * Dependency rules live in `./boundaries.js`, because they are per-package
 * rather than per-platform.
 */
export default tseslint.config(
  {
    ignores: [
      "**/.output/**",
      "**/.tanstack/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"],
    plugins: { import: importPlugin },
    rules: {
      "import/first": "error",
      "import/no-duplicates": "error",
    },
  },
);
