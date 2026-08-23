/**
 * The workspace dependency graph, in one place.
 *
 * Two consumers read this file and they must not drift apart:
 *
 *   - the flat ESLint config returned by `boundaries()`, which fails a lint run
 *     when a *source file* imports across a forbidden edge; and
 *   - `scripts/check-boundaries.mjs`, which fails CI when a *package.json*
 *     declares a forbidden dependency.
 *
 * A package can only import what it declares, and it can only declare what this
 * file allows, so the two checks close each other's gaps.
 *
 * This module deliberately imports nothing. The root check script runs it under
 * plain node before any workspace is installed.
 */

/**
 * Tooling every workspace may depend on. They ship configuration, never code
 * that reaches a bundle, so they sit outside the layering.
 */
export const CONFIG_PACKAGES = ["@setwise/eslint-config", "@setwise/typescript-config"];

/** Workspaces that only contain configuration, and so carry no source to lint. */
export const CONFIG_ONLY_WORKSPACES = CONFIG_PACKAGES;

/** Applications. Nothing may depend on these — they are composition roots. */
export const APPLICATIONS = ["@setwise/web", "@setwise/mobile"];

/**
 * For each workspace, the other workspaces it may depend on.
 *
 *   domain ← api-contract ← api-client ← apps
 *   domain + api-contract + db ← api-server ← apps/web
 *
 * Absence is a rule, not an oversight: `@setwise/mobile` cannot reach `db` or
 * `api-server`, and no row contains an application.
 */
export const ALLOWED_INTERNAL_DEPENDENCIES = {
  "@setwise/typescript-config": [],
  "@setwise/eslint-config": [],
  "@setwise/domain": [],
  "@setwise/db": ["@setwise/domain"],
  "@setwise/api-contract": ["@setwise/domain"],
  "@setwise/api-client": ["@setwise/domain", "@setwise/api-contract"],
  "@setwise/api-server": ["@setwise/domain", "@setwise/api-contract", "@setwise/db"],
  "@setwise/web": [
    "@setwise/domain",
    "@setwise/db",
    "@setwise/api-contract",
    "@setwise/api-server",
    "@setwise/api-client",
  ],
  "@setwise/mobile": ["@setwise/domain", "@setwise/api-contract", "@setwise/api-client"],
};

const REACT_DOM = ["react-dom", "react-dom/*"];
const REACT = ["react", ...REACT_DOM];
const REACT_NATIVE = [
  "react-native",
  "react-native/*",
  "react-native-*",
  "expo",
  "expo-*",
  "expo/*",
  "nativewind",
];
const DATABASE = [
  "drizzle-orm",
  "drizzle-orm/*",
  "drizzle-kit",
  "pg",
  "@neondatabase/serverless",
  "postgres",
];
const SERVER_FRAMEWORK = [
  "@tanstack/react-start",
  "@tanstack/react-start/*",
  "@tanstack/react-router",
  "@tanstack/react-router/*",
  "@vercel/functions",
  "better-auth",
  "better-auth/*",
];
const NODE_BUILTINS = [
  "node:*",
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "events",
  "fs",
  "fs/*",
  "http",
  "https",
  "os",
  "path",
  "process",
  "stream",
  "stream/*",
  "url",
  "util",
  "worker_threads",
  "zlib",
];

/**
 * Third-party packages a workspace may not import, keyed by workspace.
 *
 * The package graph alone cannot express these: `react` and `drizzle-orm` are
 * external, so nothing in `ALLOWED_INTERNAL_DEPENDENCIES` keeps them out of
 * `@setwise/domain`.
 */
export const FORBIDDEN_EXTERNAL_IMPORTS = {
  "@setwise/domain": [
    ...REACT,
    ...REACT_NATIVE,
    ...DATABASE,
    ...SERVER_FRAMEWORK,
    ...NODE_BUILTINS,
  ],
  "@setwise/api-contract": [...REACT, ...REACT_NATIVE, ...DATABASE, ...SERVER_FRAMEWORK],
  "@setwise/api-client": [...REACT_DOM, ...REACT_NATIVE, ...DATABASE, ...SERVER_FRAMEWORK],
  "@setwise/db": [...REACT, ...REACT_NATIVE, ...SERVER_FRAMEWORK],
  "@setwise/api-server": [...REACT, ...REACT_NATIVE, ...SERVER_FRAMEWORK],
  "@setwise/web": [...REACT_NATIVE],
  "@setwise/mobile": [
    ...REACT_DOM,
    ...DATABASE,
    ...SERVER_FRAMEWORK.filter((id) => !id.startsWith("better-auth")),
  ],
};

/**
 * Globals a workspace may not reference. `no-restricted-imports` cannot see
 * `process.env`, `window` or `localStorage`, because none of them is an import.
 */
export const FORBIDDEN_GLOBALS = {
  "@setwise/domain": [
    "window",
    "document",
    "navigator",
    "location",
    "history",
    "localStorage",
    "sessionStorage",
    "alert",
    "fetch",
    "XMLHttpRequest",
    "process",
    "global",
    "Buffer",
    "__dirname",
    "__filename",
    "require",
  ],
  "@setwise/api-contract": [
    "window",
    "document",
    "navigator",
    "localStorage",
    "sessionStorage",
    "process",
  ],
  "@setwise/api-server": ["window", "document", "navigator", "localStorage", "process"],
  "@setwise/db": ["window", "document", "navigator", "localStorage", "process"],
  "@setwise/api-client": ["window", "document", "localStorage", "sessionStorage", "process"],
};

const GLOBAL_REASON = {
  window: "no DOM access here",
  document: "no DOM access here",
  navigator: "no DOM access here",
  location: "no DOM access here",
  history: "no DOM access here",
  localStorage: "storage is the application's concern",
  sessionStorage: "storage is the application's concern",
  alert: "no DOM access here",
  fetch: "this layer performs no I/O",
  XMLHttpRequest: "this layer performs no I/O",
  process: "the application resolves configuration and passes it in",
  global: "no Node-only globals here",
  Buffer: "no Node-only globals here",
  __dirname: "no Node-only globals here",
  __filename: "no Node-only globals here",
  require: "ES modules only",
};

const REASON = {
  "@setwise/domain":
    "@setwise/domain is platform-neutral: no React, no database, no DOM, no Node built-ins, no environment access.",
  "@setwise/api-contract":
    "@setwise/api-contract describes shapes only. It must not reach an implementation, a runtime or a UI library.",
  "@setwise/api-client":
    "@setwise/api-client is shared transport. It must run unchanged on web and on React Native.",
  "@setwise/db":
    "@setwise/db owns persistence. Rendering and HTTP framework code belong to the app.",
  "@setwise/api-server":
    "@setwise/api-server holds business orchestration. Its HTTP and framework adapters live in apps/web.",
  "@setwise/web":
    "apps/web is the browser and server application. Native modules belong to apps/mobile.",
  "@setwise/mobile":
    "apps/mobile talks to the API over HTTP. Server-only and browser-only code must never enter the native bundle.",
};

/**
 * Flat ESLint config enforcing this file's rules for one workspace.
 *
 * @param {keyof typeof ALLOWED_INTERNAL_DEPENDENCIES} packageName
 * @returns {import("eslint").Linter.Config[]}
 */
export function boundaries(packageName) {
  const allowed = ALLOWED_INTERNAL_DEPENDENCIES[packageName];

  if (!allowed) {
    throw new Error(
      `${packageName} is not in the Setwise dependency matrix. Add it to ALLOWED_INTERNAL_DEPENDENCIES in @setwise/eslint-config/boundaries.`,
    );
  }

  const forbiddenWorkspaces = Object.keys(ALLOWED_INTERNAL_DEPENDENCIES).filter(
    (name) => name !== packageName && !allowed.includes(name) && !CONFIG_PACKAGES.includes(name),
  );

  const groups = [
    {
      group: ["**/apps/**", "**/packages/**"],
      message:
        "Reach another workspace by its package name, never by a relative path out of this one.",
    },
    {
      group: ["@setwise/*/src", "@setwise/*/src/**"],
      message: "Import a workspace's public entrypoints, not its internals.",
    },
  ];

  if (forbiddenWorkspaces.length > 0) {
    groups.push({
      group: forbiddenWorkspaces.flatMap((name) => [name, `${name}/*`]),
      message: `${packageName} may only depend on ${allowed.length > 0 ? allowed.join(", ") : "no other workspace"}. See @setwise/eslint-config/boundaries.`,
    });
  }

  const forbiddenGlobals = (FORBIDDEN_GLOBALS[packageName] ?? []).map((name) => ({
    name,
    message: `${packageName}: ${GLOBAL_REASON[name] ?? "not available in this layer"}.`,
  }));

  const forbiddenExternals = FORBIDDEN_EXTERNAL_IMPORTS[packageName] ?? [];

  if (forbiddenExternals.length > 0) {
    groups.push({ group: forbiddenExternals, message: REASON[packageName] });
  }

  return [
    {
      name: `setwise/boundaries/${packageName}`,
      files: ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"],
      rules: {
        "no-restricted-imports": ["error", { patterns: groups }],
        ...(forbiddenGlobals.length > 0
          ? { "no-restricted-globals": ["error", ...forbiddenGlobals] }
          : {}),
      },
    },
  ];
}
