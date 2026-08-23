import globals from "globals";
import tseslint from "typescript-eslint";

import base from "./base.js";
import { boundaries } from "./boundaries.js";

// This package is plain Node ESM that eslint loads, so it lints against the
// base config and the node globals rather than either platform preset.
export default tseslint.config(
  ...base,
  {
    files: ["**/*.js"],
    languageOptions: { globals: globals.node },
  },
  ...boundaries("@setwise/eslint-config"),
);
