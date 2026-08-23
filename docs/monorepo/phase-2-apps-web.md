# Phase 2 — move the existing application into `apps/web`

Adopts the final folder structure while keeping web behaviour unchanged. Compare every result here
against [`phase-0-baseline.md`](phase-0-baseline.md).

## What moved

All moves used `git mv`, so file contents are byte-identical to the baseline commit and history is
preserved. Nothing was rewritten inside a source file.

Directories moved to `apps/web/`:

```text
components/  data/  db/  drizzle/  hooks/  lib/
public/  scripts/  server/  src/  tests/
```

Files moved to `apps/web/`:

```text
components.json  drizzle.config.ts  eslint.config.mjs  playwright.config.ts
seed-preview.ts  tsconfig.json  vercel.json  vite.config.ts  vitest.config.mts
.env.example     .env.local (untracked, moved outside git)
```

`db/` and `drizzle/` stay with the web app until Phase 4 extracts `@setwise/db`.

Kept at the root: `turbo.json`, `pnpm-workspace.yaml`, `package.json`, `.prettierrc.json`,
`.prettierignore`, `.gitignore`, `.github/`, `docs/`, `README.md`.

## Why almost no source changed

Every path-sensitive configuration was already relative to either its own file or the working
directory, and both of those moved together with the files:

| Config                 | Path form                              | Effect of the move                                    |
| ---------------------- | -------------------------------------- | ----------------------------------------------------- |
| `tsconfig.json`        | `paths: { "@/*": ["./*"] }`            | none — `@/*` now resolves from `apps/web`             |
| `vite.config.ts`       | `new URL(".", import.meta.url)`        | none                                                  |
| `vitest.config.mts`    | `new URL(".", import.meta.url)`        | none                                                  |
| `playwright.config.ts` | `testDir: "./tests/e2e"`, `.env.local` | none                                                  |
| `drizzle.config.ts`    | `./db/schema/index.ts`, `./drizzle`    | none                                                  |
| `eslint.config.mjs`    | ignores relative to the config file    | none                                                  |
| `scripts/*.ts`         | `process.cwd()`                        | none, provided the script runs with `apps/web` as cwd |

This is why the `@/*` alias was deliberately kept relative to `apps/web` rather than re-pointed at
the repository root: it avoids rewriting every import in the codebase, and it is the alias shape
the app will keep permanently.

The scripts' reliance on `process.cwd()` is the one live constraint. `pnpm --filter @setwise/web`
and Turbo both set the package directory as cwd, so the documented invocations are safe; running
`tsx apps/web/scripts/seed.ts` from the root is not.

## What did change

- **`package.json` split.** Every application dependency and script moved to
  `apps/web/package.json` as `@setwise/web`. The root keeps only `turbo`, `prettier`,
  `prettier-plugin-tailwindcss`, `tailwindcss`, the `packageManager` pin, and the `engines` block.
- **`tailwindcss` added to the root.** `prettier-plugin-tailwindcss` needs to resolve it to sort
  classes, and the root Prettier pass covers `apps/web`. It is a formatting-only dependency.
- **`.prettierrc.json`.** `tailwindStylesheet` re-pointed to `./apps/web/src/styles.css`.
- **`.prettierignore`.** Generated-file entries re-pointed under `apps/web/`.
- **`.gitignore`.** Root-anchored patterns (`/node_modules`, `/.output/`, `/dist/`) were unanchored
  so they also match `apps/web/.output`, `apps/web/node_modules`, and future workspaces.
- **`test:e2e` renamed to `e2e`** in `@setwise/web`, to match the Turbo task name from Phase 1.
- **`format` and `format:check` became root tasks** (`//#format:check` in `turbo.json`). One
  Prettier pass already covers every workspace, so a per-package `format:check` would re-check the
  same files. `pnpm check` still reaches it.
- **CI** now drives `lint`, `db:check`, `build`, `test`, and `e2e` through `turbo run`. Steps that
  are not Turbo tasks — `db:migrate`, `db:seed`, `check:bundle` — use
  `pnpm --filter @setwise/web`, and the `shadcn info` and `playwright install` steps gained
  `working-directory: apps/web`.
- **READMEs.** The root README became a workspace map; `apps/web/README.md` is new and holds
  database setup, environment ownership, and deployment.

## One regression, and its cause

The first `pnpm turbo run build` failed:

```text
[MISSING_EXPORT] "eq" is not exported by
"__vite-optional-peer-dep:drizzle-orm:@better-auth/drizzle-adapter"
```

The lockfile was correct — `drizzle-orm` was resolved as an optional peer of
`@better-auth/drizzle-adapter`, and the symlink existed under `.pnpm`. The cause was a stale root
`node_modules`: the pre-move install had left 523 flat entries there from when the root _was_ the
application package, and the incremental `pnpm install` after the move did not prune them. Vite
resolved the adapter from that orphaned copy, which had no `drizzle-orm` beside it, and stubbed the
import.

Deleting `node_modules` and `apps/web/node_modules` and reinstalling fixed it. The root
`node_modules` now holds 4 entries, which is the correct shape for an orchestration-only root.

**Any structural move of a workspace package needs a clean reinstall, not an incremental one.**

## Validation

Run after the clean reinstall, from the repository root:

| Check                                            | Baseline | Now                                       |
| ------------------------------------------------ | -------- | ----------------------------------------- |
| `pnpm format:check`                              | pass     | pass                                      |
| `pnpm turbo run lint --filter=@setwise/web`      | pass     | pass                                      |
| `pnpm turbo run typecheck --filter=@setwise/web` | pass     | pass                                      |
| `pnpm turbo run build --filter=@setwise/web`     | pass     | pass                                      |
| `pnpm --filter @setwise/web check:bundle`        | pass     | pass — 90 chunks, 408.6 KB gzip           |
| `pnpm turbo run db:check --filter=@setwise/web`  | pass     | pass                                      |
| `pnpm turbo run test --filter=@setwise/web`      | pass     | pass — 14 files, 116 tests                |
| `pnpm turbo run e2e --filter=@setwise/web`       | pass     | pass — 9 tests                            |
| `pnpm dev:web`                                   | pass     | pass — `/sign-in` 200, `/` 307 to sign-in |

`turbo run build --dry` reports exactly one package in scope, `@setwise/web`, so workspace
discovery works.

### Noise, not regressions

- The `AbortError` / `status: 500` block the Nitro server prints between e2e specs is recorded as
  pre-existing in the baseline.
- `pnpm dev` logs a Base UI `nativeButton` warning from `components/ui/button.tsx` via
  `ProfilePrompt`. It is application code that `git mv` did not touch, so the move cannot have
  caused it. It is worth fixing on its own, separately from the migration.
- `turbo run test` warns `no output files found for task @setwise/web#test`. The `test` task
  declares `outputs: ["coverage/**"]` but coverage is not configured yet. Harmless; it resolves
  when coverage is enabled or the key is dropped.

## Deployment action required before the next deploy

`vercel.json` now lives at `apps/web/vercel.json`. **The Vercel project's Root Directory must be
changed to `apps/web`**, or the next deploy will fail to find it. This is a dashboard change and
cannot be made from the repository.

The build command inside the file is unchanged and still correct once the Root Directory is set,
because Vercel runs it with `apps/web` as the working directory:

```text
pnpm check:region && pnpm db:migrate && pnpm build && pnpm check:bundle
```

Phase 6 replaces it with the Turbo form
(`cd ../.. && pnpm turbo run build --filter=@setwise/web`) and adds affected-project detection.

## Exit criteria

- [x] Web renders and behaves identically to the baseline.
- [x] Auth, RPC, export, protected routes, migrations, and tests still work.
- [x] The repository has the final `apps/*` shape.
- [x] No mobile application exists yet.
- [ ] Vercel Root Directory set to `apps/web` — pending, outside the repository.
