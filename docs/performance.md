# Performance

What was slow, what changed, and what each change is measured against. The
architecture is unchanged: TanStack Start, oRPC, Better Auth, Drizzle, Neon
Postgres, Vercel. Every fix here is about placement, concurrency, round trips
and what the browser has to download.

The goal is fast, server-confirmed writes. There is still no offline queue and
no optimistic set: a set appears because the server said so, just sooner.

## What was actually slow

- Functions ran wherever Vercel put them while Neon sat in Singapore.
- Both runtime pools held one connection, so two reads on one screen queued.
- Every protected procedure resolved the session again, from the database.
- Train fired five separate requests on mount; the workout screen added two
  more per exercise for the ghost values.
- Reading one workout took four sequential queries, then two more per exercise.
- Saving a set invalidated the workout and waited for a full refetch before the
  row appeared.
- The rest timer re-rendered the whole workout four times a second.
- Recharts was about 104 KB gzip of shared code to draw two charts.

## What changed

### Placement and concurrency

Functions are pinned to `sin1` in `vercel.json`, and `pnpm check:region` fails a
production build whose `DATABASE_URL` is not an `ap-southeast-1` Neon endpoint —
a Singapore function talking to a Virginia database is worse than not pinning at
all, and nothing else would say so.

Both runtime pools hold five connections (`db/neon.ts`). `db/instrument.ts`
wraps the pool so every query's duration, and every connection acquisition, is
recorded without a timer at each call site.

### Transport and session

- `BatchLinkPlugin` on the browser client and `BatchHandlerPlugin` on
  `/api/rpc`. Reads batch through `/api/rpc/__batch__`, up to ten at a time,
  streaming. Mutations never batch: a set save is one request with a person
  watching it.
- The request context carries a memoised `getSession`, so the ten procedures in
  a batch resolve the session once. It is created per request — a module-level
  cache would leak one user's session into the next request a warm instance
  served.
- Better Auth's signed cookie cache is on, with a five-minute window.
- The authenticated route's guard reads through the query cache with the same
  five minutes, so navigating between tabs does not call the server at all.
  Signing out clears that cache in the same handler that clears the cookie.

### Reads

`lib/queries.ts` defines every query once, with a freshness policy stated in
terms of the data rather than the network (`lib/stale.ts`). Route loaders warm
what a screen needs before it mounts, through `lib/prefetch.ts`.

Two constraints shaped that file, both learned the hard way:

- A route's loader lives in the entry chunk. Moving it into the component's
  chunk (`codeSplittingOptions`) makes the server load that chunk to run the
  loader, and the streaming render fails on the boundary it creates.
- So the loader stays put and reaches the query factories — and through them the
  oRPC client — behind a dynamic import, which is also where the browser-only
  guard lives.

### Writes

`session.start` and `session.createSet` take a client-generated UUID. A repeat
returns the row already stored; the same ID with different content is a typed
`IDEMPOTENCY_CONFLICT`. That is what makes one automatic retry safe, and it is
the only mutation retry in the app.

`lib/cache.ts` holds the write-to-read dependency map. A write patches what it
can from its own response and discards inactive derived reads without fetching
them: saving a set does change the 30-day heatmap, but refetching it from the gym
floor spends a round trip on a screen nobody is looking at. Discarding the old
result also stops it flashing before that next fetch finishes. An unscoped
`invalidateQueries()` is legitimate at sign-in and sign-out and nowhere else.

### Queries

- One open workout per user is a partial unique index
  (`drizzle/0006_one_open_workout.sql`), not a read followed by an insert.
- A workout is two reads: the session with its plan, lineup and sets, then the
  previous performance for every exercise in the lineup at once.
- Recent activity picks its ten rows in a CTE before joining and aggregating.
- A set write is one `INSERT … SELECT` that also checks ownership, that the
  session is open, that it is a workout and not a rest entry, and that the
  exercise is visible. The four distinct errors are still distinct: they are
  worked out on the failure path instead of the happy one.
- Personal records are not deleted when creating a set that cannot have any, and
  the delete and insert for an edited set go out as one statement.
- The profile summary is one statement rather than two concurrent ones.

### Rendering and bundle

- The rest timer is an external store with two channels: the countdown, which
  only the bar subscribes to, and whether a timer is running, which changes
  twice per set.
- Everything that starts closed is loaded when it is opened — the exercise
  picker, the custom exercise form, the profile and weigh-in sheets, the routine
  name and targets dialogs, and the toaster.
- Recharts is gone. `components/ui/mini-chart.tsx` draws lines, dots and bars
  over one or two axes, with a textual summary as its accessible name and
  arrow-key movement between points.

## What it is measured against

Client spans are collected in `lib/perf.ts`; read `__setwisePerf()` from the
console. Nothing recorded there carries a user, a weight, a rep count or a query
input.

| Span                          | Budget                 |
| ----------------------------- | ---------------------- |
| Navigation intent to commit   | p75 under 200 ms       |
| Commit to critical data ready | p75 under 500 ms       |
| Save Set tap to row on screen | p75 300 ms, p95 600 ms |
| LCP                           | p75 under 2.5 s        |
| INP                           | p75 under 200 ms       |

Server responses carry `Server-Timing` split into session resolution, handler,
database and serialization (`server/timing.ts`). Per-procedure p50/p75/p95 and
the deployment region are emitted as structured log lines
(`server/metrics.ts`), alongside connection acquisition time, pool depth and
function cold starts.

Bundle budgets are enforced by `pnpm check:bundle`, which runs in CI and in the
Vercel build: the entry chunk under 110 KB gzip, any one route chunk under
32 KB, and no Recharts in the client bundle at all. The entry was 120 KB before
this work and is 104 KB after it.

## Rolling back

Two environment flags (`lib/flags.ts`), each restoring the behaviour that
shipped before it. Both default to on, and both should be deleted a release
after they land.

| Flag                       | Off restores                                       |
| -------------------------- | -------------------------------------------------- |
| `VITE_CACHE_PATCHING`      | invalidate-and-refetch after every write           |
| `BETTER_AUTH_COOKIE_CACHE` | resolving the session from the database every time |

The pool size in `db/neon.ts` and the region in `vercel.json` are separate
deploys on purpose, so a rise in connection saturation can be undone without
taking the rest of this with it.

## Order it was rolled out

1. Instrumentation, and a baseline captured from it.
2. Region pinning.
3. Pool size.
4. Batch transport and cookie caching, behind their flags.
5. The one-open-workout index.
6. Idempotent writes and cache patching, starting with set creation.
7. Query consolidation.
8. Timer isolation and the bundle work.
