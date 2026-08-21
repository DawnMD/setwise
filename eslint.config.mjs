import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".output/**",
      ".tanstack/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "public/body-*.svg",
      "src/routeTree.gen.ts",
      "lib/body-svg.generated.ts",
      "data/free-exercise-db.json",
      "drizzle/meta/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      import: importPlugin,
      "jsx-a11y": jsxA11y,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      "import/first": "error",
      "import/no-duplicates": "error",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
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
    files: ["components/theme-provider.tsx"],
    rules: {
      // Hydration deliberately synchronizes React state with the theme applied
      // by ScriptOnce before the application paints.
      "react-hooks/set-state-in-effect": "off",
    },
  },
);
