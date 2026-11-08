---
source: src/modules/account/tests/integration/jobs.test.ts
sha256: cee3b04b6b8482896a5715f2f2286c54541f575a81613285f29613b7d04d4023
generated_at: 2026-11-08T04:37:23.580925+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/jobs.test.ts

## Purpose

Integration test suite that verifies each declared account job resolves to the expected result shape (counts of swept rows/files). All counts are asserted as zero because the test DB is empty, confirming the jobs execute without error and return the documented contract.

## Key elements

- **`run(name: string): Promise<unknown>`** — module-private helper. Looks up a job in the `accountJobs` array by name, throws `Error('no such job: …')` if missing, and invokes `job.run()`.
- **`setupTestDb()`** — called once at module top-level to provision a clean test database before any test executes.
- **`describe('account jobs')`** — contains three `it` blocks, one per job:
  - `reap:inactive-accounts` — sets `NODE_INACTIVE_ACCOUNT_DAYS` and `NODE_INACTIVE_MINIMISE_DAYS` to `'0'` (both dials off), then asserts the result is `{ minimised: 0, warned: 0, softDeleted: 0, hardDeleted: 0 }`.
  - `reap:previous-emails` — asserts `{ cleared: 0 }`.
  - `reap:account-exports` — asserts `{ rows: 0, files: 0 }`.

## Relationships

- **`src/modules/account/jobs.ts`** — provides `accountJobs`, the array of job descriptors that this file iterates and invokes. Changing a job's `name` or its resolved return shape here will break the corresponding test.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used to stub process env vars (`NODE_INACTIVE_ACCOUNT_DAYS`, `NODE_INACTIVE_MINIMISE_DAYS`) before running `reap:inactive-accounts`.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, which the file calls at import time to create a fresh test schema.

## Notes

- `setupTestDb()` is invoked at **module top-level**, not inside a `beforeAll`/`beforeEach` hook. It runs exactly once when the file is first imported by the test runner.
- The `run` helper does no special handling beyond a linear `Array.find`; a typo in a job name surfaces as a thrown `Error` rather than a Jest assertion failure.
- The file header comment references `POST /__test/jobs/:name` as the demo-profile endpoint that exposes the same resolved counts, tying the test contract to the API surface.
- All three tests assert against a **zero-row** result set. They do not seed data or verify that rows *are* swept—only that the job runs and returns the documented keys.
