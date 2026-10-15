---
source: tests/integration/persistence/lease.test.ts
sha256: 0f736424869b58e59e519bd51d3aa87fb8420eadcd850ec9b44d3698166ffcce
generated_at: 2026-10-15T12:49:56.679462+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/lease.test.ts

## Purpose

Integration test for the lease-based mutual-exclusion primitive (`withLease`) and the job-outcome recording helpers (`recordJobOutcome`, `listLeaseSummaries`). It runs against a real MongoDB instance to verify the concurrency safety properties a scaled-up cron container depends on: single-winner acquisition, expired-lease re-acquisition, immediate release on throw, and contention resolution — plus the "never-block a future acquisition" invariant on outcome-only rows.

## Key elements

- **`setupTestDb()`** — imported from `@tests/setup-test-db`; called once at module scope to spin up a real Mongo before any test runs.
- **`waitForLeaseOwner(name)`** — local helper that polls `leaseModel.exists` (50 × 5 ms) to confirm a prior `withLease` acquisition has landed, avoiding a race with a fixed `setTimeout`.
- **`describe('withLease', …)`** — six test cases covering: two-caller contention on a held lease, first-insert race (two simultaneous upserts), re-acquisition after expiry, immediate release when the body throws, `lastError`/`lastSuccessAt` recording on the same document, and "someone else has it" against an unexpired held lease (verifying the loser does not perturb the winner's document).
- **`describe('recordJobOutcome', …)`** — three test cases: creates an immediately-acquirable row for a job that has never held a lease, records failure then success (clearing stale `lastError`), and preserves an existing `owner` via `$setOnInsert`.
- **`describe('listLeaseSummaries', …)`** (two blocks) — verifies `lastRunAt` is reported for a never-succeeded job, and that a row untouched for ~400 days is still returned (no TTL on the collection; alerting depends on it being visible).

## Relationships

- **`src/infrastructure/persistence/lease.ts`** — the module under test. Imports `leaseModel`, `withLease`, `recordJobOutcome`, `listLeaseSummaries`.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()` which provisions the real MongoDB instance used by every case in this file.

## Notes

- Real MongoDB is required: the core property under test is what MongoDB does with a concurrent `findOneAndUpdate` upsert, which a mock cannot faithfully exercise.
- `MINUTE_MS` (60 s) is used as the lease TTL throughout — deliberately long so that no case expires by accident during test execution.
- The "throw releases immediately" test proves release happened by showing a subsequent acquisition succeeds *without* waiting for TTL expiry; it also asserts `lastError` was cleared on the next clean run.
- The abandoned-row test uses `timestamps: false` to prevent Mongoose from stamping `updatedAt` with the current time, which would mask the deliberately old `lastSuccessAt`.
- `recordJobOutcome` is described as the shared D9 path for all `docker/crontab` jobs (via `scripts/run-script.ts`), not limited to `withLease` callers — the tests enforce that it never blocks a subsequent `withLease` acquisition.
