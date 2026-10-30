---
source: tests/integration/persistence/lease.test.ts
sha256: 6c642591c45e718e65161caf95fa1e2952343bccf43d24e0c8ac922b144835b1
generated_at: 2026-10-29T07:00:14.388370+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/persistence/lease.test.ts

## Purpose

Integration tests for the lease persistence layer, run against a **real** MongoDB instance (not a mock). The file verifies the mutual-exclusion semantics that make a scaled-up cron container safe: single-runner guarantee, expiry re-acquisition, crash-time release, and the "someone else has it" (resolve-`undefined`) contract on a lost race. It also exercises the job-health path (`recordJobOutcome`) and the Prometheus-facing summary query (`listLeaseSummaries`).

## Key elements

- **`describe('withLease', …)`** — Five cases covering: held-lease contention, first-insert duplicate-key race, expired-lease re-acquisition, throw-releases-immediately, and `lastError`/`lastSuccessAt` bookkeeping on the same document.
- **`describe('recordJobOutcome', …)`** — Verifies outcome-only upserts (no lease needed), error/success recording, and that `$setOnInsert` never overwrites an existing `owner`.
- **`describe('listLeaseSummaries', …)`** *(two blocks)* — Confirms `lastRunAt` is populated for a never-succeeded job, and that a stale row (>400 days old) is still reported so the `job_last_success_timestamp_seconds` alert can fire.
- **`setupTestDb()`** — Spins up a real Mongo for the suite; called once at module scope.
- **`eventually(…)`** — Polling helper used to confirm the first lease document has landed before firing the second acquisition.
- **`MINUTE_MS`** (60 000) — Shared TTL constant; long enough that no test expires by accident.

## Relationships

- **`src/infrastructure/persistence/lease.ts`** — The module under test. This file imports and exercises `leaseModel`, `withLease`, `recordJobOutcome`, and `listLeaseSummaries` directly.
- **`tests/support/eventually.ts`** — Provides the `eventually` polling utility used to await the first lease document's existence before issuing a concurrent second call.
- **`tests/support/setup-test-db.ts`** — Provides `setupTestDb`, which creates a throwaway Mongo database so tests hit real `findOneAndUpdate` / upsert semantics.

## Notes

- **Real Mongo is mandatory here.** The properties under test (concurrent `findOneAndUpdate` upserts, duplicate-key races) are engine-level behavior a mock cannot reproduce honestly.
- Two separate `describe('listLeaseSummaries', …)` blocks exist (one for `lastRunAt`, one for stale-row retention); they are not merged.
- The "abandoned row" test passes `{ timestamps: false }` to `updateOne` to prevent Mongoose from stamping `updatedAt` with the current time over the intentionally old value.
- A losing caller must resolve `undefined` (not reject) and must not mutate the winner's document — both are asserted explicitly.
- The file is truncated in the snapshot above; the last test body is cut off.
