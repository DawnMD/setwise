# Monorepo migration — Phase 1: the Turborepo shell

Makes the repository a valid Turborepo before any application code moves. Nothing was relocated, renamed, or deleted; the web app still lives at the root and still runs from the root scripts it always used.

Baseline for comparison: [`phase-0-baseline.md`](./phase-0-baseline.md).

## What landed

| Change                | Detail                                          |
| --------------------- | ----------------------------------------------- |
| `turbo`               | `2.10.11`, pinned exact as a root devDependency |
| `turbo.json`          | new — the task graph below                      |
| `pnpm-workspace.yaml` | gained `packages: [apps/*, packages/*]`         |
| `apps/`, `packages/`  | new, empty, each holding a `.gitkeep`           |
| `.gitignore`          | ignores `.turbo`                                |
| `.prettierignore`     | ignores `pnpm-lock.yaml`                        |
| `package.json`        | gained a `typecheck` script                     |

## Turbo version

Pinned to an exact `2.10.11` rather than a range. Turbo's cache key includes its own version, so a floating range silently invalidates every cache entry on a patch bump, and task-graph semantics have shifted inside 2.x before. Bump it deliberately, in its own commit, with the full check suite run after.

## Task graph

`turbo.json` declares nine tasks. Only `build` and `test` produce outputs worth caching.

| Task           | Depends on   | Cached | Notes                                        |
| -------------- | ------------ | ------ | -------------------------------------------- |
| `dev`          | —            | no     | persistent                                   |
| `build`        | `^build`     | yes    | outputs `.output/**`, `dist/**`              |
| `typecheck`    | `^typecheck` | yes    | no outputs; the cache entry is the exit code |
| `lint`         | `^lint`      | yes    | no outputs                                   |
| `format:check` | —            | yes    | no outputs; root-owned, not per-package      |
| `test`         | `^build`     | yes    | outputs `coverage/**`                        |
| `db:check`     | —            | yes    | read-only journal validation                 |
| `doctor`       | —            | no     | reserved for `expo-doctor` in Phase 8        |
| `e2e`          | `build`      | no     | own package's build, not its dependencies'   |

`e2e` depends on `build` without the caret: Playwright needs the app it is about to serve, not every upstream package artefact. `test` uses `^build` because integration tests import package source, which must be built first once packages exist.

### Deliberately uncached

Anything that mutates state outside the repository, or whose result cannot be replayed from a cache entry:

- development servers (`dev`)
- database mutations — `db:generate`, `db:migrate`, `db:seed`, `db:push`, `db:studio`
- EAS commands
- Maestro and on-device tests
- deployments
- native project generation

Of these, only `db:check` appears in `turbo.json`, because it is the read-only one. The mutating `db:*` scripts stay out of the task graph entirely and are invoked with `pnpm --filter` directly.

## Workspace globs

`pnpm-workspace.yaml` already existed but declared only `allowBuilds` and `overrides`, so the repository was a single package. It now leads with the two globs. The `rolldown: 1.1.0` override is preserved — dropping it changes the Vite build.

Both directories are empty and carry a `.gitkeep`, because git does not track empty directories and `pnpm install` should not have to tolerate a missing glob target.

`turbo ls` reports `0 no packages (pnpm9)`. That is correct for this phase: the root package is the workspace root, not a workspace member, so turbo has nothing to schedule until `apps/web` exists.

## Root scripts: why they did not change yet

The plan's final root `package.json` is orchestration-only — every script a `turbo run`. That shape is not adopted here, and the deviation is deliberate.

Phase 1's exit criterion is _no application behaviour has changed_. The web app is still at the repository root, and a root package cannot be a turbo task target. Rewriting `dev` to `turbo run dev` today would resolve to zero packages and leave the app unrunnable for the whole of Phase 1; rewriting `dev:web` to `turbo run dev --filter=@setwise/web` would fail outright, because no package answers to that name.

So the existing scripts stay, and the swap to the orchestration-only form lands in Phase 2, in the same commit that creates `@setwise/web`. At that point every filter resolves and the root has genuinely stopped owning application code.

The one addition is `typecheck: tsc --noEmit`, previously folded into `build`. Turbo needs it as a separate task to cache and to schedule across packages, and splitting it now is free.

## Prettier and the lockfile

`pnpm-lock.yaml` was committed in Prettier's style — double-quoted keys, no blank line before `importers`. pnpm writes it single-quoted. The two disagree, and pnpm wins every time, so the first `pnpm install` after Phase 0 rewrote 9,614 lines and `pnpm format:check` went red.

This was latent at baseline, not caused by the migration: any install would have tripped it. The fix is to stop Prettier owning a generated file. `pnpm-lock.yaml` is now in `.prettierignore` and the lockfile stays in pnpm's native format.

## Environment mode

Turbo 2.x defaults to `envMode: strict`, confirmed by `turbo run build --dry=json`. Task processes see only the variables a task explicitly declares, plus turbo's own passthrough list. Nothing depends on this yet — no package runs under turbo — but it is the reason Phase 7 has to enumerate `DATABASE_URL`, `BETTER_AUTH_SECRET` and the `VERCEL_*` variables in task `env` blocks. Builds that read an undeclared variable will see it as unset rather than inheriting it from the shell.

## Verification

Full baseline suite re-run from the root, against the local Postgres in `.env.local`.

| Check              | Command              | Result                                     |
| ------------------ | -------------------- | ------------------------------------------ |
| Formatting         | `pnpm format:check`  | pass                                       |
| Lint               | `pnpm lint`          | pass — no errors, no warnings              |
| Migration check    | `pnpm db:check`      | pass — journal consistent                  |
| Build              | `pnpm build`         | pass                                       |
| Bundle budgets     | `pnpm check:bundle`  | pass — 90 chunks, 408.6 KB gzip            |
| Unit + integration | `pnpm test`          | pass — 14 files, 116 tests                 |
| Browser smoke      | `pnpm test:e2e`      | pass — 9 tests                             |
| Turbo              | `pnpm exec turbo ls` | `2.10.11`, 0 packages, `turbo.json` parses |

Chunk count and gzip total are identical to baseline, so the workspace globs did not disturb hoisting or resolution. The `AbortError` noise from the Nitro web server during `test:e2e` is present and still not a failure, exactly as recorded at baseline.

## Exit criteria

- Turbo is pinned to an exact tested 2.x version — `2.10.11`.
- The root is orchestration-capable; it becomes orchestration-_only_ in Phase 2, for the reason given above.
- Workspace package discovery works; `apps/*` and `packages/*` are declared and empty.
- No application behaviour has changed.

## Next

Phase 2 moves the application into `apps/web`, creates `@setwise/web`, and swaps the root scripts to their turbo forms.
