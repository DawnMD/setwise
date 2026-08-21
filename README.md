# Setwise

A workout log built around progressive overload. Last session's number sits next
to the field where you type this session's.

Phases 0 to 4 are done: the foundation, the logger, the plan builder, the stats
screen, the bodyweight log. See [docs/plan.md](docs/plan.md) for the full build
plan, and the phase notes for what shipped in each and what it cost:
[phase 0](docs/phase-0.md), [phase 1](docs/phase-1.md),
[phase 2](docs/phase-2.md), [phase 4](docs/phase-4.md). Phase 3 shipped without
notes of its own.

## Stack

Next.js App Router, Drizzle on Neon Postgres, oRPC, Better Auth, TanStack Query,
Tailwind, shadcn/ui on Base UI (preset `b2eYKQAHg1`).

Source sits at the repo root — `app/`, `components/`, `db/`, `hooks/`, `lib/`,
`server/` — with no `src/` wrapper. `@/*` resolves to `./*`.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your Neon connection strings
npm run db:migrate
npm run db:seed
npm run dev
```

`db:migrate` writes the eighteen muscle regions itself, so a migrated database
can log training and save custom exercises straight away. `db:seed` adds the
~800-exercise global catalogue on top and re-asserts the same muscle rows; it is
idempotent and safe to run late or not at all.

`BETTER_AUTH_SECRET` needs a real value before deploying: `openssl rand -base64 32`.
Better Auth resolves its base URL per request. On Vercel, keep **Automatically
expose System Environment Variables** enabled so the generated deployment,
branch and production domains are allowlisted without overriding
`BETTER_AUTH_URL` for every preview.

## Scripts

| Script                 | What it does                                             |
| ---------------------- | -------------------------------------------------------- |
| `npm run dev`          | Dev server on :3000                                      |
| `npm run db:check`     | Check committed migration history for collisions         |
| `npm run db:export`    | Print the schema's SQL DDL without changing the database |
| `npm run db:generate`  | Generate a migration from schema changes                 |
| `npm run db:migrate`   | Apply committed migrations with Drizzle Kit              |
| `npm run db:push`      | Sync directly after confirmation; local prototyping only |
| `npm run db:seed`      | Seed the exercise catalogue. Optional, idempotent.       |
| `npm test`             | Run all Vitest integration tests once                    |
| `npm run test:watch`   | Re-run Vitest integration tests as files change          |
| `npm run db:studio`    | Drizzle Studio                                           |
| `npm run svg:generate` | Redraw the body SVGs from `scripts/generate-body-svg.ts` |

The integration tests use the database in `.env.local`. Migrate and seed it
before the first run. Every fixture is attached to a throwaway user and cleaned
up after its test file finishes.

The normal schema workflow is code first: edit `db/schema`, run
`npm run db:generate -- --name=<change>`, review the generated SQL, run
`npm run db:check`, then apply it with `npm run db:migrate`. Commit the schema,
SQL migration and `drizzle/meta` snapshot together. `db:push` deliberately asks
for confirmation and should only be used for disposable local prototyping
because it does not create a migration file.

## Things that will bite you

**The muscle list is frozen.** `lib/muscles.ts` is the single definition of
the eighteen regions. It drives table rows, SVG path ids and the muscle picker at
once. Changing it means a migration, an SVG regeneration and a reseed.

**Everything is stored in kilograms.** `user.unitPref` is display only.

**Migrations use `DATABASE_URL_UNPOOLED`.** Neon recommends a direct connection
for ORM migration tools; application queries use the pooled `DATABASE_URL`.

**Re-run `npm test` after touching exercise tagging.** It is the check
that catches the heatmap silently inheriting a bad muscle factor.

**Set ids are minted on the client**, as UUIDv7, and the server upserts on them.
That is what makes a retry after a timeout a no-op instead of a duplicate set.
Never let the server generate one.

**Nothing here has been used in a real gym yet.** The plan is right that this is
the step that finds the flaws, and it has now gone unbuilt for two phases.

**`--accent` and `--border` belong to shadcn.** The preset writes both. App
colours use `--overload`, `--pr` and `--band-*`; a failed save uses the preset's
`--destructive`.

**Use the `touch` size on anything reachable mid-set.** The lyra style tops out
at 36px and this app needs 44. `Button`, `Slider` and `NativeSelect` each carry
one.
