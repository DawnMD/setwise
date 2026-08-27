import { defineConfig, globalIgnores } from "eslint/config";

import { boundaries } from "@setwise/eslint-config/boundaries";
import web from "@setwise/eslint-config/web";
import globals from "globals";

// The shared web preset carries the language options, the React and a11y
// plugins and the import rules. What stays here is what only this application
// can know: its generated files, and the handful of justified rule waivers.
export default defineConfig(
  ...web,
  ...boundaries("@setwise/web"),
  globalIgnores(["public/body-*.svg", "src/routeTree.gen.ts", "lib/body-svg.generated.ts"]),
  {
    files: ["tests/**/*.{ts,tsx}", "**/*.test.{ts,tsx}", "playwright.config.ts"],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
  {
    files: ["components/catalogue/muscle-picker.tsx", "components/progress/muscle-heatmap.tsx"],
    rules: {
      // The generated SVG paths are selected through one delegated event on
      // their wrapper; the adjacent toggle controls provide keyboard access.
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-static-element-interactions": "off",
    },
  },
  {
    files: ["components/ui/input-group.tsx", "components/ui/label.tsx"],
    rules: {
      // These shadcn primitives acquire their control relationship and focus
      // target from the component that composes them.
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-noninteractive-element-interactions": "off",
      "jsx-a11y/label-has-associated-control": "off",
    },
  },
  {
    files: ["components/plan/routine-name-form.tsx"],
    rules: { "jsx-a11y/no-autofocus": "off" },
  },
  {
    files: ["components/ui/mini-chart.tsx"],
    rules: {
      // A chart is a figure you can also interrogate. It carries a textual
      // summary as its accessible name, takes focus once rather than once per
      // point, moves between points with the arrow keys, and announces the one
      // under the cursor through a live region beneath it.
      "jsx-a11y/no-noninteractive-element-interactions": "off",
      "jsx-a11y/no-noninteractive-tabindex": "off",
    },
  },
  {
    files: ["components/theme-provider.tsx"],
    rules: {
      // Hydration deliberately synchronizes React state with the theme applied
      // by ScriptOnce before the application paints.
      "react-hooks/set-state-in-effect": "off",
    },
  },
);
