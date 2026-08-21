# Phase 0 — foundation

Phase 0 established the account and data foundation now used by the TanStack Start application.

- Better Auth provides email/password accounts and cookie sessions.
- The root and authenticated route guards resolve sessions on the server.
- Drizzle and Postgres hold accounts, the global exercise catalogue, custom exercises, and the
  eighteen canonical muscle regions.
- The Tailwind/shadcn Base UI design system provides the mobile shell and touch-sized controls.
- Vite, Nitro, pnpm, Vitest, and Playwright provide the development and delivery toolchain.

The current shell is under `src/routes`, while reusable modules remain at repository root. Server
secrets are read only by server-marked modules. Local setup is `pnpm install`, `pnpm db:migrate`,
`pnpm db:seed`, and `pnpm dev`.
