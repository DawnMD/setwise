# Phase 2 — plans

Plans provide named routines, ordered workout or rest days, ordered exercises, and optional targets
for sets, repetitions, and effort. The Train screen presents upcoming days by recency and starts a
workout using the session ID returned by the server. Rest-day logging likewise returns a
database-generated activity ID.

Plan pages are client-rendered beneath the authenticated data-only SSR boundary. Their direct URLs
still execute the server session guard, while navigation uses typed TanStack Router destinations
and parameters. Plan and logger data are fetched through oRPC and TanStack Query.
