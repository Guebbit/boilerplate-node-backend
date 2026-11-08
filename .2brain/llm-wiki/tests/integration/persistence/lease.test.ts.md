---
source: tests/integration/persistence/lease.test.ts
sha256: 6c642591c45e718e65161caf95fa1e2952343bccf43d24e0c8ac922b144835b1
generated_at: 2026-11-08T09:44:36.421895+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/lease.test.ts

## Purpose

Integration tests for the Mongo-backed lease and job-outcome primitives in `src/infrastructure/persistence/lease.ts`. They verify the concurrency and durability guarantees a scaled-up cron container relies on (mutual exclusion, expiry, crash-release, contention semantics) against a **real** MongoDB, since the properties under test are defined by MongoDB's `findOneAndUpdate` upsert behavior that a mock cannot exercise.

## Key elements

- **`describe('withLease')`** — six cases covering: exclusive execution under contention (held lease), exclusive first-insert race (two concurrent upserts), re-acquisition after expiry, immediate release on throw, `lastError`/`lastSuccessAt` bookkeeping, and "someone else has it" (resolves `undefined`, does not reject, does not perturb the holder's document).
- **`describe('recordJobOutcome')`** — three cases for the job-health path used by every crontab job via `scripts/run-script.ts`: row creation for a name that never took a lease, failure-then-success clearing, and `$setOnInsert` semantics that must not overwrite an existing `owner`.
- **`describe('listLeaseSummaries')`** — two cases (in two separate `describe` blocks): `lastRunAt` is populated even for a job that has never succeeded, and a row older than any retention window still appears (no TTL on the collection).
- **`MINUTE_MS`** — constant (60 000) used as `ttlMs` throughout; long enough that no lease expires by accident during the test.
- **`setupTestDb()`** — called at module top level to provision a real Mongo before any test runs.

## Relationships

- **`src/infrastructure/persistence/lease.ts`** — the system under test. The file imports `leaseModel`, `withLease`, `recordJobOutcome`, and `listLeaseSummaries`; every assertion is about the observable state those functions leave in the `leaseModel` collection.
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, which connects Mongoose to a throwaway MongoDB instance so the tests exercise real `findOneAndUpdate` upsert semantics.
- **`tests/support/eventually.ts`** — provides `eventually`, a polling helper used to wait until a lease document exists before firing a second concurrent acquisition (avoids a race in the test harness itself).

## Notes

- The file deliberately uses **real Mongo, not a mock**. The doc comment at the top explains that the property under test is what MongoDB does with concurrent `findOneAndUpdate` upserts, which a mock cannot replicate honestly.
- Two `describe('listLeaseSummaries')` blocks exist (one for `lastRunAt` visibility, one for no-TTL retention). They are logically one group but split to keep each block's comment focused.
- `setupTestDb()` is called at the **top level** of the module (not inside `beforeAll`), meaning the DB connection is established at import time.
- The "immediately acquirable" invariant for `recordJobOutcome` rows (their `expiresAt` must be in the past) is load-bearing: a stale `recordJobOutcome` row would block a real `withLease` acquisition for the same name.
- `timestamps: false` is passed to `updateOne` in the abandoned-row test to prevent Mongoose from stamping `updatedAt` with the current time, which would invalidate the "older than retention" precondition.
