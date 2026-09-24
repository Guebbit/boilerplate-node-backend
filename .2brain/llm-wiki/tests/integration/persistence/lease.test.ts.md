---
source: tests/integration/persistence/lease.test.ts
sha256: 5a653857d299ea9abf49cd3a3f9c582b5843ac5b5702489319268d4ea38742c9
generated_at: 2026-09-23T20:05:23.274869+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/lease.test.ts

## Purpose

Integration test for `withLease` (the Mongo-based lease acquisition primitive) against a real database. It verifies the four safety properties a scaled-up cron container depends on: mutual exclusion, expiry is not permanent, a crash frees the lease immediately (no `ttlMs` wait), and a lost contended acquisition resolves `undefined` rather than rejecting. Real Mongo is required because the property under test is MongoDB's own concurrent `findOneAndUpdate` upsert semantics, which a mock cannot exercise.

## Key elements

- **`waitForLeaseOwner(name)`** — helper that polls `leaseModel.exists` up to 50 × 5 ms to confirm a prior acquisition has landed before asserting on subsequent state, avoiding fixed-`setTimeout` races.
- **`describe('withLease')`** — six `it` blocks covering:
    - Mutual exclusion when a lease is already held (second caller resolves `undefined`, body never runs).
    - First-insert race: two back-to-back `Promise.all` calls on a fresh name; exactly one wins, the other gets `undefined`.
    - Re-acquisition after release (release stamps `expiresAt` to epoch, so the next call finds it expired immediately).
    - Immediate release on body throw — a same-window retry succeeds without waiting out `ttlMs`; `lastError` is cleared on the next success.
    - Bookkeeping: `lastError` recorded on throw, `lastSuccessAt` recorded on clean run, stale `lastError` cleared by a subsequent success.
    - Losing a duplicate-key race against a pre-existing held document leaves the holder's record untouched (owner, `expiresAt` unchanged).

## Relationships

- **`src/infrastructure/persistence/lease.ts`** — the module under test. The file imports `withLease` (the public acquire-run-release wrapper) and `leaseModel` (the Mongoose model used for direct state inspection and pre-seeding held documents).
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()`, called once at module top-level to point Mongoose at a real (presumably in-memory or ephemeral) MongoDB instance for the duration of the suite.

## Notes

- The first test deliberately holds the lease open via a deferred `Promise` so the second acquisition genuinely overlaps the first; an instantly-resolving body would let the first call finish and release before the second's request reaches the server, masking the contention.
- Lease names are prefixed `scheduled-jobs-test.` to avoid colliding with production documents or other test files sharing the same test database.
- The "expired" test relies on an implementation detail: release stamps `expiresAt` to the epoch (`RELEASED` sentinel in `lease.ts`), so no actual time must elapse for the next acquisition to succeed.
- `MINUTE_MS` (60 s) is used as `ttlMs` throughout — long enough that no test's window can accidentally expire, yet irrelevant to assertions because the tests verify logical state rather than wall-clock deadlines.
