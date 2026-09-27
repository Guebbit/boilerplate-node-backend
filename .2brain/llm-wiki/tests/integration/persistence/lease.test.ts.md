---
source: tests/integration/persistence/lease.test.ts
sha256: 14e03a63b1d8383526267bfe485bd3c55b8b6e6501fd9ec6ab34e06a5bc6b617
generated_at: 2026-09-27T15:56:48.544325+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/lease.test.ts

## Purpose

Integration tests that exercise `withLease` and `recordJobOutcome` against a **real MongoDB instance** (not a mock), verifying the concurrency-safety properties a scaled-up cron container depends on: mutual exclusion, expired-lease re-acquisition, immediate release on failure, and non-throwing loss of a contested acquisition. Uses real Mongo because the critical property is how MongoDB handles concurrent `findOneAndUpdate` upserts, which a mock cannot replicate honestly.

## Key elements

- **`MINUTE_MS` (60 000)** — TTL constant for all lease acquisitions in these tests; long enough to prevent accidental expiry during test execution.
- **`waitForLeaseOwner(name)`** — polls `leaseModel.exists({ _id: name })` at 5 ms intervals (up to 50 attempts) to confirm a prior `withLease` call's document has landed, replacing a fixed `setTimeout` guess.
- **`describe('withLease')`** — six cases covering:
  - One-of-two contention while a lease is actively held (second caller resolves `undefined`, body never runs).
  - First-insert race (two truly concurrent upserts for a fresh name; exactly one body runs).
  - Re-acquisition after expiry (release stamps `expiresAt` to epoch, so next acquire succeeds immediately).
  - Immediate release on body throw (a follow-up acquire succeeds without waiting out `ttlMs`; `lastError` is cleared).
  - Outcome recording: `lastError` on failure, `lastSuccessAt` on clean run, and stale `lastError` cleared on recovery.
  - Losing a held-lease race leaves the winner's document untouched.
- **`describe('recordJobOutcome')`** — three cases covering:
  - Creating an outcome-only row (already-expired `expiresAt`, so it never blocks a real lease).
  - Recording failure then success (clears prior `lastError`).
  - Not overwriting an existing `owner` field (`$setOnInsert` semantics).

## Relationships

- **`src/infrastructure/persistence/lease.ts`** — source of all three APIs under test (`leaseModel`, `withLease`, `recordJobOutcome`). The tests assert the behavioral contract defined there.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, called once at module level to spin up a real MongoDB instance for the test suite.

## Notes

- The file header references `docs/reference/ops.md#scheduled-jobs` for the rationale of choosing a Mongo lease over a Redis lock.
- `recordJobOutcome` is documented as the "D9 path" used by every `docker/crontab` job via `scripts/run-script.ts`, not only jobs that also take a mutual-exclusion lease.
- Test names use the `scheduled-jobs-test.` prefix (with sub-suffixes like `.fresh`, `.expired`, `.throws`) to namespace lease documents and avoid cross-test collisions.
- The contention test uses a manually-resolved promise (`finishFirst`) to keep the first caller's body in flight long enough for the second acquisition to genuinely race — an instantly-resolving body would serialize the two calls and defeat the test.
