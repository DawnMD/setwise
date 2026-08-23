# Monorepo migration — Phase 0 baseline

The reference point for the Turborepo and Expo migration. Every failure after this document is compared against it: if a check fails here, it was already failing; if it passes here and fails later, the migration broke it.

These are the _migration_ phases, kept under `docs/monorepo/`. They are separate from the product build phases in `docs/phase-0.md` through `docs/phase-6.md`.

## Snapshot

| Item          | Value                                      |
| ------------- | ------------------------------------------ |
| Date          | 2026-08-23                                 |
| Branch        | `main`                                     |
| Commit        | `32e6f24a50847176529824bf43c8f56075333555` |
| Worktree      | clean — nothing stashed, nothing discarded |
| Node          | v24.14.1                                   |
| pnpm          | 11.22.0 (`packageManager: pnpm@11.22.0`)   |
| Tracked files | 239                                        |

The worktree was already clean when Phase 0 began, so there was no user work to preserve. Nothing was reset, stashed, or removed.

## Baseline check results

Run from the repository root against the local Postgres in `.env.local`.

| Check              | Command                                     | Result                                                     |
| ------------------ | ------------------------------------------- | ---------------------------------------------------------- |
| Formatting         | `pnpm format:check`                         | pass — all matched files use Prettier style                |
| Lint               | `pnpm lint`                                 | pass — no errors, no warnings                              |
| Migration check    | `pnpm db:check`                             | pass — journal consistent                                  |
| Build              | `pnpm build` (`vite build && tsc --noEmit`) | pass                                                       |
| Bundle budgets     | `pnpm check:bundle`                         | pass — entry 100.4 KB / 110.0 KB, 90 chunks, 408.6 KB gzip |
| Unit + integration | `pnpm test`                                 | pass — 14 files, 116 tests, ~40s                           |
| Browser smoke      | `pnpm test:e2e`                             | pass — 9 tests, ~20s                                       |

### Pre-existing failures

None. Every check is green at `32e6f24`, so any red after a migration step is a regression, not inherited debt.

### Pre-existing noise (not failures)

`pnpm test:e2e` prints `AbortError: This operation was aborted` from the Nitro web server between specs, with `status: 500` and `unhandled: true`. It comes from a connection closed while a response was still open, the tests pass either way, and it is present at this commit. Do not read it as a migration symptom.

## Dependency versions at baseline

Recorded so a post-migration lockfile can be diffed against it. The framework and toolchain pins that matter most:

| Package                                                | Version                 |
| ------------------------------------------------------ | ----------------------- |
| `react` / `react-dom`                                  | 19.2.8 (exact)          |
| `@tanstack/react-router`                               | 1.170.31 (exact)        |
| `@tanstack/react-start`                                | 1.168.48 (exact)        |
| `@tanstack/react-query`                                | ^5.101.4                |
| `nitro`                                                | 3.0.260610-beta (exact) |
| `vite`                                                 | 8.1.5 (exact)           |
| `rolldown`                                             | 1.1.0 (pnpm override)   |
| `@vitejs/plugin-react`                                 | 6.1.0 (exact)           |
| `babel-plugin-react-compiler`                          | 1.0.0 (exact)           |
| `@tailwindcss/vite`                                    | 4.2.2 (exact)           |
| `tailwindcss`                                          | ^4                      |
| `drizzle-orm`                                          | ^0.45.2                 |
| `drizzle-kit`                                          | ^0.31.10                |
| `@neondatabase/serverless`                             | ^1.1.0                  |
| `pg`                                                   | ^8.16.3                 |
| `better-auth`                                          | ^1.7.1                  |
| `@orpc/client`, `@orpc/server`, `@orpc/tanstack-query` | ^1.15.0                 |
| `zod`                                                  | ^4.4.3                  |
| `vitest`                                               | ^4.1.11                 |
| `@playwright/test`                                     | ^1.55.0                 |
| `typescript`                                           | ^5                      |
| `eslint`                                               | ^9                      |
| `prettier`                                             | ^3.9.6                  |

The full list is `package.json` at `32e6f24`; `pnpm-lock.yaml` is the exact record.

Engines require Node `>=22.12.0` and pnpm `>=11.22.0`. CI runs Node 24.

## Migration journal

Seven applied migrations, dialect `postgresql`, journal version 7.

| idx | tag                              |
| --- | -------------------------------- |
| 0   | `0000_init`                      |
| 1   | `0001_exercise_source_fields`    |
| 2   | `0002_seed_muscles`              |
| 3   | `0003_rest_day_activity_kind`    |
| 4   | `0004_remove_offline_resilience` |
| 5   | `0005_user_profile`              |
| 6   | `0006_one_open_workout`          |

`drizzle.config.ts` reads schema from `./db/schema/index.ts`, writes to `./drizzle`, records applied migrations in `drizzle.__drizzle_migrations`, uses `snake_case`, and filters to the `public` schema. It prefers `DATABASE_URL_UNPOOLED` and forces `sslmode=verify-full` for non-local hosts.

Phase 4 must carry the journal, the seven SQL files, and `drizzle/meta/` into `@setwise/db` intact. Regenerating them would orphan the applied history in every existing database.

## Environment-variable contract

Server, required:

- `DATABASE_URL` — pooled connection.
- `DATABASE_URL_UNPOOLED` — direct connection; migrations prefer it.
- `BETTER_AUTH_SECRET`.
- `BETTER_AUTH_URL` — local auth origin only.

Server, optional:

- `DATABASE_DRIVER` — `neon` or `pg`. CI sets `pg`.
- `BETTER_AUTH_COOKIE_CACHE` — set to `0`, `false` or `off` to resolve the session from the database on every request.

Vercel system variables read by the app:

- `VERCEL`, `VERCEL_ENV`, `VERCEL_REGION`, `VERCEL_URL`, `VERCEL_BRANCH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `AWS_REGION`.

Deployment origins are discovered from these rather than from `BETTER_AUTH_URL`, which is why the example file says the local value needs no deployment override.

Client, build-time (`import.meta.env`, in `lib/flags.ts`):

- `VITE_ORPC_BATCH` — off falls back to one request per read.
- `VITE_CACHE_PATCHING` — off invalidates and refetches after every write.

Both default to on and are intended for deletion a release after they landed.

Other: `CI` gates Playwright retries, reporter and `forbidOnly`.

`db/connection.ts` exports `requireEnv(name)`, a dynamic `process.env[name]` lookup that throws when unset. Phase 4 removes environment reads from `@setwise/db`; `apps/web` will pass resolved configuration into `createDatabase`.

## Vercel configuration

`vercel.json` at the root:

```json
{
  "buildCommand": "pnpm check:region && pnpm db:migrate && pnpm build && pnpm check:bundle",
  "framework": "tanstack-start",
  "regions": ["sin1"]
}
```

Migrations run inside the build. `sin1` is deliberate and `scripts/check-region.ts` enforces it. Phase 6 moves this file to `apps/web/vercel.json` and sets the project Root Directory to `apps/web`.

## Current repository shape

Root-level source directories, all of which move to `apps/web` in Phase 2:

```
components/   body bodyweight catalogue home logger plan profile progress ui
data/         free-exercise-db.json
db/           connection instrument neon sync-muscles tooling validators + schema/
drizzle/      7 migrations + meta/
hooks/        8 hooks
lib/          25 modules + exercise-seed/
public/       body-front.svg body-back.svg favicon.ico
scripts/      check-bundle check-region generate-body-svg seed
server/       metrics orpc timing + queries/ router/
src/          router.tsx routeTree.gen.ts styles.css + routes/ server/
tests/        e2e/ integration/ unit/
```

Root config files: `components.json`, `drizzle.config.ts`, `eslint.config.mjs`, `playwright.config.ts`, `tsconfig.json`, `vite.config.ts`, `vitest.config.mts`, `vercel.json`, `.prettierrc.json`, `.prettierignore`, `.env.example`, `seed-preview.ts`.

`pnpm-workspace.yaml` already exists but declares only `allowBuilds` and `overrides` — it has no `packages:` key, so the repository is currently a single package. Phase 1 adds `apps/*` and `packages/*` to this existing file rather than creating a new one, and must keep the `rolldown: 1.1.0` override.

## Routes

Seventeen file routes under `src/routes`:

```
__root.tsx
_auth.tsx                        _auth/sign-in.tsx  _auth/sign-up.tsx
_authenticated.tsx
_authenticated/index.tsx         _authenticated/body.tsx
_authenticated/onboarding.tsx    _authenticated/progress.tsx
_authenticated/settings.tsx
_authenticated/plan/index.tsx    _authenticated/plan/$routineId.tsx
_authenticated/train/index.tsx   _authenticated/train/$sessionId.tsx
api/auth/$.ts                    api/export.ts                api/rpc/$.ts
```

## Server entrypoints

Three HTTP entrypoints, all of which stay inside `apps/web` after the migration:

- `src/routes/api/rpc/$.ts` — oRPC `RPCHandler` with `BatchHandlerPlugin` (`maxSize: 10`), prefix `/api/rpc`. Already close to its Phase 6 shape: it builds a per-request `createSessionResolver(request.headers)` so a batch resolves the session once, reports cold starts, and appends a `Server-Timing` header. Phase 5 replaces the `router` import with `createApiRouter(deps)`.
- `src/routes/api/auth/$.ts` — Better Auth handler.
- `src/routes/api/export.ts` — CSV download.

Plus `src/server/session.functions.ts`, the server function used by the route guards.

Server-side modules that move to packages: `server/router/*` (bodyweight, catalogue, home, plan, profile, session, stats) and `server/queries/*` (bodyweight, export, home, plan, profile, prs, session, stats) to `@setwise/api-server`; `server/orpc.ts` splits between the app adapter and the server package; `server/metrics.ts` and `server/timing.ts` stay with the app until Sentry replaces them.

## Aliases

One alias, `@/*` to the repository root, declared in three places that must stay in step:

- `tsconfig.json` — `"paths": { "@/*": ["./*"] }`
- `vite.config.ts` — `resolve.alias` `"@"` to the directory URL, plus `tsconfigPaths: true`
- `vitest.config.mts` — `resolve.alias` `"@"` to the directory URL

Usage by target, across 125 files:

| Prefix         | Imports |
| -------------- | ------- |
| `@/components` | 202     |
| `@/lib`        | 171     |
| `@/db`         | 53      |
| `@/hooks`      | 27      |
| `@/server`     | 16      |
| `@/src`        | 2       |

Phase 2 rebases `@/*` onto `apps/web` so none of these 471 import specifiers change. They will change later, and only where Phases 4 and 5 move a module into a package.

The `components.json` aliases (`@/components`, `@/lib/utils`, `@/components/ui`, `@/lib`, `@/hooks`) must be rebased with it, or shadcn writes new components to the wrong place. Style is `base-lyra`, base colour `zinc`, stylesheet `src/styles.css`.

## Generated files

Both are committed, and both are Prettier- and ESLint-ignored:

- `src/routeTree.gen.ts` — written by the TanStack Start Vite plugin, which is configured with `srcDirectory: "src"` and `router.routesDirectory: "routes"`. Consumed by `src/router.tsx`.
- `lib/body-svg.generated.ts` — written by `pnpm svg:generate` (`scripts/generate-body-svg.ts`), alongside `public/body-front.svg` and `public/body-back.svg`.

## Script path assumptions

Every script resolves paths from `process.cwd()`, so each keeps working when its package becomes the working directory:

- `scripts/generate-body-svg.ts` writes `<cwd>/public` and `<cwd>/lib/body-svg.generated.ts`
- `scripts/seed.ts` reads `<cwd>/data/free-exercise-db.json`
- `scripts/check-bundle.ts` reads `.vercel/output/static/assets` and `.output/public/assets`, ordered by whether `VERCEL` is set

`scripts/` at the root is reserved by the final architecture for `dev-android.mjs`. These four are web-owned and move to `apps/web/scripts` in Phase 2.

## CI at baseline

One workflow, `.github/workflows/ci.yml`, one job on `ubuntu-latest`, 30-minute timeout, a Postgres 17-alpine service, Node 24, `DATABASE_DRIVER: pg`. Steps in order:

`pnpm install --frozen-lockfile`, `format:check`, `lint`, `pnpm dlx shadcn@latest info --json`, `db:check`, `db:migrate`, `db:seed`, `build`, `check:bundle`, `test`, install Chromium, `test:e2e`.

Phase 7 replaces the middle of this with Turbo tasks. The Postgres service, the frozen lockfile, and the shadcn verification step are retained.

## What Phase 0 did not do

No file was moved, renamed, or deleted. No dependency changed. The only addition is this document.
