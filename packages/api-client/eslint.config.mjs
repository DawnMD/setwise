import { defineConfig } from "eslint/config";

import base from "@setwise/eslint-config/base";
import { boundaries } from "@setwise/eslint-config/boundaries";

export default defineConfig(...base, ...boundaries("@setwise/api-client"));
