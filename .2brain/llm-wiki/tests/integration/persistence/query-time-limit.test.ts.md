---
source: tests/integration/persistence/query-time-limit.test.ts
sha256: 1400567e23cc3f63f43cee5d5e70a9abb39099f8a84db52833f2ccc4ec71df5b
generated_at: 2026-11-08T09:45:02.789276+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/query-time-limit.test.ts

## Purpose

Integration test that verifies the global per-query time limit (`maxTimeMS`) set via `configureMongoose` actually causes mongod to kill slow queries with server error 50 (`MaxTimeMSExpired`) for both `find` and `aggregate` paths, and that individual queries can override or lift the limit. It exercises behavior a unit mock cannot: real server-side query cancellation.

## Key elements

- **`probeModel`** – Minimal Mongoose model (single `name: String` field) used as the query target; one seeded row suffices because the stall helpers run per-document.
- **`MAX_TIME_MS_EXPIRED`** (constant `50`) – The MongoDB server error code for a query killed by `maxTimeMS`.
- **`slowFilter(ms)`** – Returns a `$where` filter that calls server-side `sleep(ms)`, guaranteeing mongod cannot short-circuit the delay.
- **`slowAggregateStage(ms)`** – Returns an aggregation stage using `$function` inside `$expr` inside `$match` (the `$function`-based equivalent, since `$where` is disallowed in `$match`).
- **`describe('maxTimeMS')`** – Five test cases covering: find killed, aggregate killed, query within limit succeeds, per-query `maxTimeMS(0)`/`maxTimeMS(5000)` overrides the global, and global `configureMongoose(0)` lifting the limit entirely.
- **`afterAll`** – Restores the connection's time-limit to the suite default by calling `configureMongoose()` with no argument.

## Relationships

- **`src/infrastructure/runtime/database.ts`** – Provides `configureMongoose(ms?)`, which sets the connection-wide `maxTimeMS`. This test calls it to install, override, and reset the limit under test.
- **`tests/support/setup-test-db.ts`** – Provides `setupTestDb()`, which establishes a real MongoDB connection for the integration suite. Called once at the top of the file before any queries run.

## Notes

- The test mutates a **global** connection setting (`maxTimeMS`). If this file is ever split or reordered within a Jest worker, `afterAll` must still run to restore the default; otherwise subsequent test files in the same worker inherit whatever limit was last set.
- Server-side JavaScript (`$where`, `$function`) is deliberately used to create an *unavoidable* stall. A mock or in-memory driver would never produce error 50, which is the entire reason this test targets a real mongod.
- `maxTimeMS(0)` on a **query** means "no per-query limit" (i.e., ignore the global), not "zero milliseconds." The test asserts this explicitly.
