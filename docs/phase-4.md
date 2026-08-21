# Phase 4 — progress and bodyweight

Progress combines training volume, intensity, exercise trends, muscle distribution, personal
records, and daily bodyweight. Bodyweight keeps its one-entry-per-user-per-local-day rule. Charts
and body maps render in the authenticated browser UI from server-authorized oRPC queries.

Settings exposes the account email, light/dark/system theme selection, and authenticated CSV
downloads for sets and bodyweight. Theme is the sole persisted local UI preference. CSV export
retains its public columns and is an account portability feature, not an offline data store.

Regression coverage lives in the Vitest/Postgres integration suite and the Playwright Chromium
smoke suite. Use `pnpm test` for domain behavior and `pnpm test:e2e` after a production build for
the authentication, routing, logging, persistence-boundary, theme, sign-out, and export flows.
