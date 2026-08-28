# Monorepo migration — Phase 6: web deployment adapters

Phase 6 leaves `apps/web` as Setwise's permanent HTTP and deployment host while removing its last
client-side dependency on database response types. There is deliberately no `apps/api`.

## Runtime composition

The RPC route is the composition root for one oRPC handler. It creates the shared API router with
the web database adapter and latency callback, resolves Better Auth into the package-neutral
`ApiPrincipal`, and memoizes that resolver once per HTTP request. All operations in an oRPC read
batch therefore share one authentication promise. The route owns HTTP method dispatch and the
`Server-Timing` response header; it contains no SQL, ownership rule, or procedure implementation.

Better Auth remains in `apps/web/lib/auth.ts`. It owns the Drizzle adapter, email/password setup,
cookie cache, TanStack Start cookie integration, additional user fields, and the Vercel host allow
list. The shared API packages do not import Better Auth or read the environment.

The export route authenticates the request and owns content type, cache policy, filename, and the
download response. Data selection and CSV formatting are provided by `@setwise/api-server/export`.

The database adapter in `apps/web/db` resolves environment variables, attaches Vercel's pool
lifecycle hook, and connects request-local timing instrumentation. Schema, queries, transactions,
migrations, and seed logic remain in `@setwise/db`.

## Browser boundary

Web components and browser cache helpers now consume DTO types from `@setwise/api-contract` rather
than query or schema types from `@setwise/db`. Only web runtime adapters, deployment tooling, and
database-focused integration tests import server/database packages.

## Vercel

Repository configuration assumes these project settings:

```text
Root Directory: apps/web
Build Command:  cd ../.. && pnpm turbo run build --filter=@setwise/web
Skip unaffected projects: enabled
```

`apps/web/vercel.json` pins the TanStack Start framework, Singapore function region, the workspace
root build command, and a `turbo-ignore` fallback. Mobile-only changes are outside the web package's
dependency closure and should not deploy it.

Database migration is intentionally not a Turbo build task because it mutates external state and
must never be replayed from a cache. Run `pnpm --filter @setwise/db db:migrate` as an explicit
release step before promotion.

## External verification checklist

The repository can enforce build shape and local behavior, but cannot prove dashboard settings,
preview aliases, or production cookie behavior without a linked Vercel project. Before Phase 6 is
declared operationally complete, verify on a preview and then production:

- Root Directory is `apps/web` and automatic affected-project skipping is enabled.
- A mobile-only commit is skipped for the web project.
- `/api/auth/*`, `/api/rpc/*`, and `/api/export` respond on the deployment host.
- Sign-in cookies survive a reload and sign-out clears them.
- A protected route works on a direct load and rejects a signed-out direct load.
- Batched RPC reads authenticate once and include `Server-Timing`.
- CSV exports have the expected content type, filename, and account-scoped rows.
- Production and preview hosts are trusted without broadening the origin allow list.

Until that pass is recorded, code-level Phase 6 is complete but deployment verification remains
pending.
