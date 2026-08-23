import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

import base from "./base.js";

/**
 * React Native runs a browser-shaped subset: `fetch`, `console`, timers and
 * `URL` exist; the document, the window and web storage do not. The `globals`
 * package has no React Native preset, so the browser set is taken and the
 * pieces Hermes does not provide are switched off.
 *
 * `no-undef` is off under typescript-eslint, so the switched-off globals are
 * documentation. `no-restricted-globals` is what actually fails the run.
 */
const absentInReactNative = Object.fromEntries(
  ["alert", "document", "history", "localStorage", "location", "sessionStorage", "window"].map(
    (name) => [name, "off"],
  ),
);

export default tseslint.config(...base, reactHooks.configs.flat.recommended, {
  files: ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"],
  languageOptions: {
    globals: { ...globals.browser, ...absentInReactNative, __DEV__: "readonly" },
  },
  rules: {
    "no-restricted-globals": [
      "error",
      ...Object.keys(absentInReactNative).map((name) => ({
        name,
        message: `${name} does not exist in React Native. Use a native API or a shared abstraction.`,
      })),
    ],
  },
});
