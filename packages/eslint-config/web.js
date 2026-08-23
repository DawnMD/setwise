import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

import base from "./base.js";

/** Browser and server-rendered React: the shape apps/web has always linted at. */
export default tseslint.config(...base, reactHooks.configs.flat.recommended, {
  files: ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"],
  languageOptions: {
    globals: { ...globals.browser, ...globals.node },
  },
  plugins: {
    "jsx-a11y": jsxA11y,
    "react-refresh": reactRefresh,
  },
  rules: {
    ...jsxA11y.flatConfigs.recommended.rules,
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
  },
});
