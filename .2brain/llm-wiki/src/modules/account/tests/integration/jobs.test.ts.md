---
source: src/modules/account/tests/integration/jobs.test.ts
source_sha256: 00b533a363d3dd850e367353e9cb59769f781f302665f978a75a81032ea5f6e9
context_sha256: 07b755bdd0873d19487e3996219e18abbfa1a90ac962c150d2d60e7844429c92
generated_at: 2026-11-22T03:55:50.367477+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/integration/jobs.test.ts

## Purpose
Integration test that runs each of the `account` module's declared jobs and asserts what each one resolves: a count of what it swept. These resolved values are what the demo profile's `POST /__test/jobs/:name` returns, so a journey can assert that a job did something.

## Key elements
- `run(name)`: looks up a job by `name` in `accountJobs`, calls its `run()`, and returns the result. Throws `no such job: <name>` if no job matches.
- `reap:inactive-accounts` test: with `NODE_INACTIVE_ACCOUNT_DAYS` and `NODE_INACTIVE_MINIMISE_DAYS` both `'0'` (both dials off), expects `{ minimised: 0, warned: 0, softDeleted: 0, hardDeleted: 0 }`.
- `reap:previous-emails` test: expects `{ cleared: 0 }`.
- `reap:account-exports` test: expects `{ rows: 0, files: 0 }`.

## Relationships
- `src/modules/account/jobs.ts`: provides `accountJobs`, the list of jobs (each with a `name` and `run()`) that this test looks up and executes.
- `tests/support/setup-test-db.ts`: `setupTestDb()` is called at module level to prepare the test database (imported as `@tests/setup-test-db`).
- `tests/support/environment.ts`: `setEnvironment()` sets the env vars for the inactive-accounts test (imported as `@tests/environment`).

## Notes
- All expected counts are zero, so these tests check each job's result shape and that it runs cleanly, not that it actually removes anything.
- Only the inactive-accounts test sets environment values explicitly.
