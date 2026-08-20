# Setwise

A workout log built around progressive overload. Last session's number sits next
to the field where you type this session's.

Phase 0 (foundation) and Phase 1 (the logger) are done. See
[docs/plan.md](docs/plan.md) for the full build plan, and
[docs/phase-0.md](docs/phase-0.md) and [docs/phase-1.md](docs/phase-1.md) for what
shipped in each and what it cost.

## Stack

Next.js App Router, Drizzle on Neon Postgres, oRPC, Better Auth, TanStack Query,
Tailwind, Base UI.

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

`BETTER_AUTH_SECRET` needs a real value before deploying: `openssl rand -base64 32`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply migrations (uses the unpooled endpoint) |
| `npm run db:seed` | Seed muscles and the exercise catalogue. Idempotent. |
| `npm run db:verify` | Assert effective-set maths against a known week |
| `npm run db:verify:logging` | Assert plate maths, UUIDv7, PR detection and the set upsert |
| `npm run db:studio` | Drizzle Studio |
| `npm run svg:generate` | Redraw the body SVGs from `scripts/generate-body-svg.ts` |

## Things that will bite you

**The muscle list is frozen.** `lib/muscles.ts` is the single definition of
the eighteen regions. It drives table rows, SVG path ids and the muscle picker at
once. Changing it means a migration, an SVG regeneration and a reseed.

**Everything is stored in kilograms.** `user.unitPref` is display only.

**Migrations use `DATABASE_URL_UNPOOLED`.** Neon's pooler runs in transaction
mode, where DDL and advisory locks misbehave.

**Re-run `npm run db:verify` after touching exercise tagging.** It is the check
that catches the heatmap silently inheriting a bad muscle factor.

**Set ids are minted on the client**, as UUIDv7, and the server upserts on them.
That is what makes a retry after a timeout a no-op instead of a duplicate set.
Never let the server generate one.

**The logger has not been used in a real gym yet.** The plan is right that this
is the step that finds the flaws. Do it before starting Phase 2.
