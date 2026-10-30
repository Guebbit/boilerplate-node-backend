---
source: src/modules/account/tests/integration/jobs.test.ts
sha256: cee3b04b6b8482896a5715f2f2286c54541f575a81613285f29613b7d04d4023
generated_at: 2026-10-29T02:56:16.646296+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/jobs.test.ts

## Purpose

Integration tests that pin the **return shape** (zero-count objects) of each declared account job when the test database is empty. These shapes are the contract the demo profile's `POST /__test/jobs/:name` endpoint relays back, so a journey test can assert "the job did something" without inspecting internals.

## Key elements

- **`run(name)`** – Module-scoped helper that looks up a job in `accountJobs` by `name` and calls its `.run()`. Throws if no job matches.
- **`reap:inactive-accounts`** – Sets `NODE_INACTIVE_ACCOUNT_DAYS` and `NODE_INACTIVE_MINIMISE_DAYS` to `'0'` (dials off), then asserts the resolution is `{ minimised: 0, warned: 0, softDeleted: 0, hardDeleted: 0 }`.
- **`reap:previous-emails`** – Asserts resolution is `{ cleared: 0 }`.
- **`reap:account-exports`** – Asserts resolution is `{ rows: 0, files: 0 }`.

## Relationships

- **`src/modules/account/jobs.ts`** – Source of the `accountJobs` array (each entry exposes `name` and `run()`); this test iterates that catalog by name.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module top level to seed a clean in-memory/ephemeral database before any test runs.
- **`tests/support/environment.ts`** – `setEnvironment` is used to toggle the two `NODE_INACTIVE_*` dials for the inactive-accounts case.

## Notes

- `setupTestDb()` runs at **import time** (top-level, outside `beforeAll`), so it executes once when the test file is loaded rather than per-suite.
- All assertions are **zero-value** checks (empty-state). The tests do not insert fixtures and do not verify that rows *would* be swept; they only confirm the shape and default counts.
- The `run` helper is intentionally strict: an unknown job name produces a hard `Error`, surfacing typos in test names immediately rather than failing on an `undefined` resolution.
