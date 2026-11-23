---
source: src/infrastructure/persistence/job-store.ts
source_sha256: 4f3104e528d805f42436a2b484286f59eece3105fa5abbad5e144611e88be5c5
context_sha256: e328bb03bd813b91019eb88183b04a1cef13ca767fd9b5f009a27da1cb71c564
generated_at: 2026-11-22T03:02:46.026224+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/job-store.ts

## Purpose
The durable fallback queue for jobs that were meant for the broker but couldn't be sent because it is configured and down. Each held job is one MongoDB row (channel, payload, attempts, lease). Workers drain the queue, so a job is never dropped and never run inside a request. A held job has no TTL; only `dead` rows expire (after 7 days). A drained row is deleted immediately.

## Key elements
- `jobModel`: Mongoose model on the `jobs` collection. Fields are `channel`, `payload` (Mixed), `status` (`pending` | `dead`), `attempts`, `nextAttemptAt`, `lockedUntil`, `leaseToken`, `lastError`, `expiresAt` and `createdAt`.
- `JobDocument`, `JobModel`, `JobStatus`: exported types.
- `CLAIM_LEASE_MS` (60s): how long a claim holds a row before another worker may take it. It bounds takeover of a dead worker's job, not job duration.
- `holdJob(channel, payload)`: inserts a pending job that is due immediately.
- `claimNextJob(channels, leaseMs)`: one atomic `findOneAndUpdate` takes the oldest due pending row whose lease is absent or lapsed. It stamps a fresh `leaseToken` and `lockedUntil`, and returns the updated row or `null`.
- `renewJobLease(job, leaseMs)`: extends the lease while a long handler runs.
- `completeJob(job)`: deletes the finished row.
- `retryJobLater(job, error, delayMs)`: increments `attempts`, pushes `nextAttemptAt` out, records `lastError` and clears the lease. Backoff needs no timer.
- `parkJob(job, error)`: marks the row `dead`, increments `attempts`, and sets `expiresAt` for 7 days. It is never claimed again.
- `deleteJobsMentioning(emails, session?)`: erasure support. It scans every job of any status, and deletes those whose payload strings mention any of the given addresses. It returns `{ id, payload }[]` for the deleted jobs and takes an optional transaction session. Internal helpers are `stringsOf` (flattens all payload strings, lowercased) and `mentionsAddress` (matches whole addresses only).

## Relationships
- `src/domain-primitives/time.ts`: supplies `DAY_MS` for the dead-row TTL.
- `src/infrastructure/persistence/serialize.ts`: `applySerialization` omits `leaseToken` from serialized output.
- `src/infrastructure/persistence/normalize-email.ts`: `normalizeEmail` normalizes the addresses given to `deleteJobsMentioning`.
- `src/infrastructure/observability/metrics-queue.ts`: imports `setHeldJobsReader`, which per the module doc feeds the held-jobs gauges behind the `HeldJobsStuck` alert. The call is not visible in the shown portion.
- `src/infrastructure/adapters/job-drain.ts`: the worker-side drain that consumes this store. It claims, renews, completes, retries and parks jobs.
- `src/infrastructure/adapters/job-dispatch.ts`: a neighbor in the graph. The shown content does not show how it uses this file; presumably it holds jobs when the broker is down.
- `src/modules/users/services/held-jobs.ts`: neighbor in the graph. The tests named below cover erasure of held jobs, which matches `deleteJobsMentioning`.
- `src/modules/account/tests/integration/erasure-ledger.test.ts`, `src/modules/users/tests/integration/erasure-held-jobs.test.ts`, `tests/integration/job-drain.test.ts` and `tests/integration/job-store.test.ts`: integration tests covering this store.
- `src/infrastructure/config/fields.ts`: a graph neighbor. Nothing in the shown content uses it.

## Notes
- Every result write (`renewJobLease`, `completeJob`, `retryJobLater`, `parkJob`) matches on `_id` and `leaseToken`. A worker whose lease lapsed or was taken over therefore writes nothing.
- The TTL index on `expiresAt` (`expireAfterSeconds: 0`) never touches held jobs, since they have no `expiresAt`. Changing it requires `npm run db:sync`.
- Webhook deliveries are not held here. They keep their own `webhooks` row and are sent by the worker's `fallbackSweep`. Images and exports are held here.
- `deleteJobsMentioning` scans the whole collection because `payload` is free-form. That is acceptable because the collection is small by design. Address matching treats a neighboring address character as a different address, so `bob@x.com` does not match `abob@x.com` or `bob@x.com.au`.
- The claim query is served by the index on `{ status, channel, nextAttemptAt }`. The oldest due row is picked by `nextAttemptAt`, then `_id`.
