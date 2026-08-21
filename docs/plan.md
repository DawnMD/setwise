# Setwise architecture and product plan

This document records the current system rather than an obsolete implementation roadmap.

## Product shape

Setwise supports account authentication, workout logging, reusable routines, progressive-overload
prompts, personal records, training statistics, bodyweight tracking, and CSV export. Public URLs
remain `/sign-in` and `/sign-up`; authenticated features remain under `/train`, `/plan`,
`/progress`, and `/settings`.

## Application architecture

TanStack Start owns the document, file routing, server functions, and Nitro production build.
TanStack Router performs server session checks at `/` and the `_authenticated` route boundary.
Authenticated routes use `ssr: "data-only"`: their guard and route data execute on the server,
then React feature screens render in the browser. Public authentication screens remain fully
server-rendered.

Each router instance owns one TanStack Query client. Feature queries and mutations remain typed
oRPC calls over `/api/rpc/*`. Better Auth is exposed at `/api/auth/*`, and authenticated CSV export
is exposed at `/api/export`. Drizzle reads and writes Postgres through server-only modules.

The framework-specific files live under `src`; reusable features remain under `components`,
`hooks`, `lib`, `db`, and `server`. Styling uses Tailwind CSS, Archivo Variable, and the existing
shadcn/Base UI `base-lyra` component set.

## Confirmed-write training model

Postgres generates workout-session, rest-activity, and set identifiers. A new set uses the
insert-only `session.createSet` contract. Editing uses `session.updateSet` with an existing set ID;
deletion remains ownership-scoped. Insert and update transactions also maintain personal-record
state.

The logger displays only rows returned by the server. Save remains disabled while its request is in
flight. Success refreshes session data, closes the drawer, reports records, and starts a rest timer
for a working set. Failure leaves the values and drawer open and displays an inline destructive
alert. A subsequent Save is a new request.

Workout state is not available offline. Exercise selections that have not produced saved sets and
rest timers are memory-only and reset when the training page unmounts or reloads. Theme preference
persists independently as a display preference, and screen wake lock remains a live-session tool.

## Data correctness

- One active workout per user remains enforced.
- One rest-day activity per user and local calendar day remains enforced.
- One bodyweight entry per user and local calendar day remains enforced.
- Finished or rest sessions reject set writes.
- Exercise visibility and row ownership are checked server-side.
- Set reads order by `performed_at`, then `set_index`.
- CSV columns and download URLs remain stable.

## Delivery gates

Changes are ready only after formatting, linting, migration validation, migration and seed against
a disposable database, integration tests, production build/type-check, Playwright smoke tests, and
the shadcn project audit pass. Vercel previews must verify cookies, all API paths, direct route
loads, client navigation, workout confirmation behavior, export, and sign-out before promotion.

Further product work should preserve server-confirmed writes and reliable-connection requirements;
offline queues, persisted training drafts, and client-generated write identifiers are outside the
product design.
