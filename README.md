# Setwise

A workout log built around progressive overload. Last session's number sits next
to the field where you type this session's.

Phases 0 to 2 are done: the foundation, the logger, the plan builder. See
[docs/plan.md](docs/plan.md) for the full build plan, and the phase notes for what
shipped in each and what it cost: [phase 0](docs/phase-0.md),
[phase 1](docs/phase-1.md), [phase 2](docs/phase-2.md).

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
| `npm run db:verify:plan` | Assert day reordering, plan ownership, session prefill and what-to-run-next |
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

**Nothing here has been used in a real gym yet.** The plan is right that this is
the step that finds the flaws, and it has now gone unbuilt for two phases.

**`--accent` and `--border` belong to shadcn.** The preset writes both. App
colours use `--overload`, `--pr` and `--band-*`; a failed save uses the preset's
`--destructive`.

**Use the `touch` size on anything reachable mid-set.** The lyra style tops out
at 36px and this app needs 44. `Button`, `Slider` and `NativeSelect` each carry
one.
