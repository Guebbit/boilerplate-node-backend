---
source: tests/integration/persistence/query-time-limit.test.ts
sha256: 1400567e23cc3f63f43cee5d5e70a9abb39099f8a84db52833f2ccc4ec71df5b
generated_at: 2026-10-15T12:50:20.967324+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/query-time-limit.test.ts

## Purpose

Integration test that verifies `configureMongoose`'s per-query time limit (`maxTimeMS`) actually causes mongod to kill a query past the limit (error 50, `MaxTimeMSExpired`) for both `find` and `aggregate`, and that a query naming its own limit overrides the global setting. Runs against a real database because the kill behavior is server-side and unobservable via mocks.

## Key elements

- **`probeModel`** — minimal Mongoose model (`{ name: String }`) with a single document inserted per test; sufficient because `$where`/`$function` sleep runs once per row.
- **`MAX_TIME_MS_EXPIRED`** — constant `50`, the MongoDB server error code for a killed query.
- **`slowFilter(ms)`** — builds a `$where` filter containing `sleep(ms)`, used to make a `find` take a controllable amount of server time.
- **`slowAggregateStage(ms)`** — builds an aggregation pipeline stage using `$match` → `$expr` → `$function` with a JS `sleep(ms)` body (the aggregation-compatible way to stall, since `$where` is not allowed in `$match`).
- **`describe('maxTimeMS')`** — five cases: find killed, aggregate killed, in-limit query succeeds, per-query `.maxTimeMS(0)` / `.maxTimeMS(5000)` overrides the global, and global knob set to `0` removes the limit entirely.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — provides `configureMongoose(ms?)`. The tests call it with specific values (`150`, `5000`, `0`) to set the global ceiling, and in `afterAll` call it with no argument to restore the suite-level default.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, called once at module top-level to spin up a real mongod connection for the test file.

## Notes

- `configureMongoose(0)` is a sentinel meaning "no limit," not a 0 ms timeout. The last test case documents this explicitly.
- Per-query `.maxTimeMS(0)` is the mechanism by which scheduled jobs and exports opt out of the global ceiling; the test asserts both `0` (no limit) and a finite override work.
- The `afterAll` reset matters: without it, the modified global would leak into subsequent test files running in the same Jest worker.
- `$where` is used for `find` and `$function` inside `$expr` for `aggregate` because the two query shapes have different constraints on allowed operators.
