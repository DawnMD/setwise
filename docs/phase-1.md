# Phase 1 — workout logger

The logger starts a server-generated workout session, builds an in-memory exercise lineup, and
saves sets through typed oRPC mutations. The server verifies session ownership, session state, and
exercise visibility before each write. Working-set inserts and edits update personal records in the
same transaction.

New sets are insert-only and receive database-generated IDs. Existing rows use an explicit update
contract. The UI does not add a set row until the response succeeds. A failed request keeps the
drawer values visible with an inline error, and another Save begins a fresh request.

The rest timer defaults to 120 seconds and uses an absolute in-memory deadline so it remains
accurate while the mounted page is backgrounded. It resets on reload or navigation. Unsaved
exercise choices also reset. Setwise requires a reliable connection while recording workouts and
does not maintain a workout queue or persisted drafts.
