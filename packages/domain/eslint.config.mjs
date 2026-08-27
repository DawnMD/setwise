import { defineConfig } from "eslint/config";

import base from "@setwise/eslint-config/base";
import { boundaries } from "@setwise/eslint-config/boundaries";

// No platform preset. `@setwise/domain` is neither a web nor a native
// workspace, and the boundaries config is what keeps it that way.
export default defineConfig(...base, ...boundaries("@setwise/domain"));
