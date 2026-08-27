# @setwise/db

Setwise's server-only persistence package. It owns the Drizzle schema and relations, query helpers,
migration history, catalogue seed, and database connection types. It may depend on
`@setwise/domain`; it never imports an application.

Runtime callers create a database with explicit configuration:

```ts
createDatabase({ pooledUrl, directUrl, driver: "neon" });
```

The runtime package does not resolve environment variables. The command-line adapters read the
web-owned contract from `apps/web/.env.local` because `apps/web` remains the sole deployment host.

Run from the repository root:

```bash
pnpm --filter @setwise/db db:check
pnpm --filter @setwise/db db:generate -- --name=<change>
pnpm --filter @setwise/db db:migrate
pnpm --filter @setwise/db db:seed
pnpm --filter @setwise/db db:studio
```

Migration and seed commands are intentionally not Turbo-cached.
