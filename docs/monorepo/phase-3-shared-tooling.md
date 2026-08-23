# Phase 3 — shared tooling and dependency boundaries

Gives every present and future workspace an inherited TypeScript and ESLint configuration, and
makes the package layering a thing the build enforces rather than a thing the plan describes.

No application code changed. Compare the results against
[`phase-2-apps-web.md`](phase-2-apps-web.md).

## What landed

```text
packages/typescript-config/    base.json  web.json  react-native.json  node.json
packages/eslint-config/        base.js    web.js    react-native.js    boundaries.js
scripts/check-boundaries.mjs
```

`apps/web` now extends both, and keeps only what is specific to it.

## `@setwise/typescript-config`

Four presets, resolved through the package's `exports` map, which TypeScript 5 follows for
`extends`.

| Preset         | Adds to base                                       | For                                 |
| -------------- | -------------------------------------------------- | ----------------------------------- |
| `base`         | —                                                  | `domain`, `api-contract`            |
| `web`          | `lib: dom, dom.iterable, esnext`, `jsx: react-jsx` | `apps/web`                          |
| `react-native` | `lib: esnext`, `jsx: react-jsx`, `types: []`       | `apps/mobile` (Phase 8)             |
| `node`         | `lib: esnext`, `types: ["node"]`                   | `db`, `api-server`, script packages |

`base` is the previous `apps/web/tsconfig.json` with the two web-only options lifted out. Nothing
else was tightened — no `noUncheckedIndexedAccess`, no `moduleDetection`. This phase is about where
configuration lives, not about raising the strictness bar, and mixing the two would make any new
error ambiguous. `tsc --showConfig` in `apps/web` resolves to the same option set as before, option
for option.

Every preset keeps `moduleResolution: bundler`, including `node`. Vite and Metro both consume
package source directly, so a package that switched to `nodenext` would be type-checked under
resolution rules that no bundler in this repository actually uses.

`types: ["node"]` obliges the package to depend on `@types/node`. `types: []` in the React Native
preset is there so a stray hoisted `@types/node` cannot make `process` and `Buffer` type-check in a
bundle that has neither; Phase 8 layers `expo/tsconfig.base` on top for `expo/types`.

## `@setwise/eslint-config`

`base` holds what is true everywhere: `@eslint/js` recommended, typescript-eslint recommended,
`import/first`, `import/no-duplicates`, and the ignore list. `web` adds the browser and node
globals, `react-hooks`, `jsx-a11y` and `react-refresh`. `react-native` adds `react-hooks` and a
React Native global set.

There is no `globals` preset for React Native, so `react-native.js` takes the browser set and
switches off the seven globals Hermes does not provide — `window`, `document`, `location`,
`history`, `alert`, `localStorage`, `sessionStorage` — then bans them through
`no-restricted-globals`. The ban is the part that works: typescript-eslint disables `no-undef`, so
an unlisted global is otherwise silent.

The plugins moved out of `apps/web` and became dependencies of the config package, beside the
config that imports them. Flat config resolves plugins from the importing module, so this works
without any hoisting assumption. `apps/web` keeps `eslint` and `globals`, which its own config file
imports directly, and its config now uses `defineConfig` from `eslint/config` rather than
`tseslint.config`, so it no longer needs `typescript-eslint` either.

`eslint-import-resolver-typescript` was dropped. It was declared but never configured — no
`settings["import/resolver"]` block existed, and the two enabled `import` rules do not resolve
anything. Wiring it up would have meant enabling `import/no-unresolved` in the same change, which is
a lint-coverage decision, not a migration one.

## One matrix, two enforcement points

`packages/eslint-config/boundaries.js` is the only place the dependency graph is written down. It
imports nothing, so plain node can read it before anything is installed.

```text
domain ← api-contract ← api-client ← apps/web, apps/mobile
domain + api-contract + db ← api-server ← apps/web
```

Two things read it:

- **`boundaries(packageName)`** returns a flat ESLint config for that workspace:
  `no-restricted-imports` for every workspace outside its layer, for the third-party packages the
  layer forbids, for relative paths that climb out of the package, and for `@setwise/*/src/**` deep
  imports; plus `no-restricted-globals` for the layers that must not see `window` or `process`.
- **`scripts/check-boundaries.mjs`** walks the `pnpm-workspace.yaml` globs and checks each
  `package.json`.

Neither is sufficient alone. ESLint only sees imports that exist, so a dependency declared today and
imported next month passes lint until the day it breaks the architecture. The manifest check only
sees declarations, so it cannot catch a relative import that reaches sideways into another
workspace's source and needs no dependency at all.

The manifest check also fails when an internal dependency is not `workspace:*`, when a config
package appears in `dependencies` instead of `devDependencies`, when a workspace is missing from the
matrix, and when a non-config workspace has no `tsconfig.json` extending a shared preset or no flat
ESLint config. That last pair is Phase 3's exit criterion, made mechanical.

### What the rules refuse

| Workspace      | Cannot import                                                                         |
| -------------- | ------------------------------------------------------------------------------------- |
| `domain`       | any other workspace, React, React Native, Drizzle, `pg`, Better Auth, Node built-ins  |
| `api-contract` | implementations (`db`, `api-server`), React, React Native, Drizzle, server frameworks |
| `api-client`   | `db`, `api-server`, `react-dom`, React Native, Drizzle, TanStack Start                |
| `db`           | React, React Native, TanStack Start, Better Auth                                      |
| `api-server`   | React, React Native, TanStack Start/Router, Vercel APIs, Better Auth                  |
| `apps/web`     | Expo and React Native                                                                 |
| `apps/mobile`  | `db`, `api-server`, `react-dom`, Drizzle, `pg`, TanStack Start                        |

And, for every workspace: any application, any `../../apps/…` or `../../packages/…` path, and any
`@setwise/*/src/**` internal.

`domain` and `api-contract` additionally lose `process`, so neither can read an environment
variable. Configuration is resolved by the application and passed in — the same reason
`createDatabase` will take a `DatabaseOptions` in Phase 4 instead of reading `DATABASE_URL`.

Node built-ins are banned in `domain` but not in `apps/mobile`, deliberately: `metro.config.js`,
`babel.config.js` and `app.config.ts` are Node files that live in the mobile package root, and a
package-wide ban would fail on all three. Metro's own resolution failure covers the real case loudly
enough.

### Verified, not assumed

Each rule was run against a probe file rather than trusted to be wired up.

In `apps/web`, a file importing `react-native` and `../../packages/eslint-config/base.js` produced
two errors; the same file's `@setwise/db` import produced none, which is correct — `apps/web` is
allowed that edge. Through the ESLint `Linter` API, the `domain`, `api-contract` and `mobile`
configs each rejected exactly the imports and globals their layer forbids.

The manifest check was given a deliberately bad `packages/eslint-config/package.json` — a dependency
on `@setwise/web`, and `@setwise/db` at `^1.0.0` — and reported all three distinct violations before
exiting non-zero.

## Wiring

- Root script `boundaries`, root turbo task `//#boundaries`, uncached. It reads files inside every
  package while running from the root; a cache entry keyed on root inputs would go stale silently,
  and the check takes well under a second.
- `pnpm check` is now `turbo run format:check boundaries lint typecheck test build`.
- CI runs `pnpm boundaries` between the formatting and lint steps, so a layering mistake is reported
  before a wall of type errors caused by it.

## Validation

| Check                                      | Baseline | Now                             |
| ------------------------------------------ | -------- | ------------------------------- |
| `pnpm format:check`                        | pass     | pass                            |
| `pnpm boundaries`                          | new      | pass — 3 workspaces             |
| `pnpm turbo run lint`                      | pass     | pass — web and eslint-config    |
| `pnpm turbo run typecheck`                 | pass     | pass                            |
| `pnpm turbo run build`                     | pass     | pass                            |
| `pnpm --filter @setwise/web check:bundle`  | pass     | pass — 90 chunks, 408.6 KB gzip |
| `pnpm turbo run db:check`                  | pass     | pass                            |
| `pnpm turbo run test`                      | pass     | pass — 14 files, 116 tests      |
| `pnpm turbo run e2e --filter=@setwise/web` | pass     | pass — 9 tests                  |

Chunk count and gzip total are unchanged, which is the signal that moving the lint plugins out of
`apps/web` did not disturb resolution.

`pnpm turbo run test` still warns `no output files found for task @setwise/web#test`, as recorded in
Phase 2. Unchanged, and still harmless.

## Exit criteria

- [x] Every workspace has an explicit TypeScript and ESLint configuration, and the boundary check
      fails if one does not.
- [x] Forbidden imports fail automatically, at both the import site and the manifest.
- [x] There are no hidden root dependency assumptions: the root holds `turbo`, `prettier`,
      `prettier-plugin-tailwindcss` and `tailwindcss`, and depends on no workspace.

## Next

Phase 4 extracts `@setwise/domain` and `@setwise/db`. Both are already in the matrix, so the first
`pnpm boundaries` run after they are created will tell you whether they landed in the right layer.
