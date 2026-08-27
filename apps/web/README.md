# @setwise/web

The Setwise web application: the TanStack Start UI and the permanent host of the Setwise API.

Run these commands from the repository root with `pnpm --filter @setwise/web <script>`, or from
this directory with `pnpm <script>`.

## Layout

The TanStack framework shell lives in `src/`: file routes are in `src/routes`, router setup is in
`src/router.tsx`, and global styles are in `src/styles.css`. Reusable application code sits in the
sibling `components`, `hooks`, `lib`, `db`, and `server` directories. The `@/*` alias
resolves from `apps/web`, not from the repository root.

The small `db` directory is the runtime adapter that resolves web environment variables and wires
Vercel lifecycle/timing hooks. Schema, queries, migrations, and seeds live in `packages/db`;
platform-neutral rules live in `packages/domain`.

## Setup

```bash
cp .env.example .env.local
pnpm --filter @setwise/db db:migrate
pnpm --filter @setwise/db db:seed
pnpm dev:web            # from the repository root
```

Fill in `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` in
`apps/web/.env.local`. Database command adapters load this file before `.env`. Runtime secrets are
unprefixed server variables; never expose them through a `VITE_` name.

`db:migrate` creates the muscle-region rows needed for custom exercises. `db:seed` adds the global
exercise catalogue and is idempotent. Generate a production auth secret with
`openssl rand -base64 32`.

## Commands

| Script         | Purpose                                     |
| -------------- | ------------------------------------------- |
| `dev`          | Vite development server on port 3000        |
| `build`        | Build the Nitro server and type-check       |
| `start`        | Run `.output/server/index.mjs`              |
| `test`         | Vitest unit and Postgres integration suites |
| `e2e`          | Playwright Chromium smoke suite             |
| `svg:generate` | Regenerate body-map SVG assets              |
| `check:bundle` | Check client bundle budgets against a build |

Integration and browser tests use the configured Postgres database. Migrate and seed it before
running them. Database changes follow a code-first workflow in `packages/db`: edit `src/schema`,
run `pnpm --filter @setwise/db db:generate -- --name=<why>`, review the SQL, run `db:check`, apply
it, and commit the schema, migration, journal, and snapshot together.

The `svg:generate`, `check:bundle`, and `check:region` scripts resolve paths from the working
directory, so they must run with `apps/web` as the current directory. The `--filter` form does
that for you.

## Deployment

Vercel deploys this directory with the `tanstack-start` framework preset. The Vercel project's
**Root Directory must be set to `apps/web`** — `vercel.json` moved here during the Turborepo
migration, and its build command resolves against this package. Nitro selects its Vercel output
during the build, so no custom output directory is needed.

Keep Vercel's automatically exposed system environment variables enabled so Better Auth can trust
preview, branch, and production hosts without a separate auth URL for every deployment.

Verify auth cookies, the `/api/auth/*`, `/api/rpc/*`, and `/api/export` endpoints, direct
protected-route loads, client navigation, and the browser smoke suite on a preview before
production promotion.

## Invariants

- All stored weights are kilograms; unit preference is display-only.
- `packages/domain/src/muscles.ts` defines the eighteen muscle regions used by schema rows, SVG paths, and pickers.
- Application colours use `--overload`, `--pr`, and `--band-*`; shadcn owns the core theme tokens.
- Mid-workout controls retain the custom touch-sized variants.
- The generated `src/routeTree.gen.ts` is committed but excluded from linting and formatting.
