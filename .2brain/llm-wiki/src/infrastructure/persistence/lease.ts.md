---
source: src/infrastructure/persistence/lease.ts
sha256: 639c1f74496526c453f95a51e55cc89d379e7409dc84c9d20217f38513fd336f
generated_at: 2026-10-29T02:13:06.626848+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/lease.ts

## Purpose

Provides a Mongo-backed mutual-exclusion lease so that a scaled-up cron deployment runs each periodic job in exactly one container per window. One atomic upsert decides the winner; the lock lives in the same store as the guarded work. The file also records per-job success/failure timestamps that the observability health endpoint surfaces to operators.

## Key elements

- **`LeaseDocument`** — interface for one lease row: `owner`, `expiresAt`, `lastSuccessAt`, `lastError`, Mongoose timestamps.
- **`leaseModel`** — Mongoose model on collection `leases`; `_id` is the job name (not a generated id) so the upsert can address it without a lookup.
- **`LeaseSummary`** — projected shape (`name`, `lastSuccessAt`, `lastRunAt`, `lastError`) consumed by the health endpoint.
- **`listLeaseSummaries()`** — queries all lease rows (sorted by `_id`, lean) and maps them to `LeaseSummary[]`.
- **`acquireLease()`** (internal) — single `findOneAndUpdate` upsert; wins when the lease is missing, expired, or already owned by the caller's token. Returns `false` on E11000 (someone else holds it).
- **`releaseLease()`** (internal) — sets `expiresAt` to `RELEASED` (epoch) and records the outcome; filtered on `owner: token` so a stale holder cannot clobber a new one.
- **`recordJobOutcome()`** — records a job's success/error without acquiring a lease; upserts with `$setOnInsert` so it never blocks a later `withLease` call.
- **`withLease<T>(name, ttlMs, run)`** — public API: acquires the lease, runs `run()`, releases on both success and throw. Returns `undefined` (without calling `run`) when the lease is already held by another.

## Relationships

- **`scripts/run-script.ts`** — calls `recordJobOutcome` for every crontab job (lease-guarded or not) so the health endpoint sees all jobs.
- **`scripts/ops/run-job.ts`** — expected consumer of `withLease` for guarded periodic work.
- **`src/modules/observability/services/job-health.ts`** — reads `listLeaseSummaries` to populate `GET /observability/health`.
- **`src/infrastructure/observability/metrics-registry.ts`** — exports `job_last_run_timestamp_seconds` / `job_last_success_timestamp_seconds` derived from the same lease rows.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` is called when a release or outcome-record write fails (non-fatal path).
- **`src/infrastructure/persistence/mongo-errors.ts`** — `isDuplicateKey` is checked in `acquireLease` to distinguish E11000 from other errors.
- **`tests/integration/persistence/lease.test.ts`** — integration tests for acquire/release/withLease semantics.
- **`tests/integration/persistence/command-metrics.test.ts`** — verifies the metrics emitted alongside lease activity.

## Notes

- **No fencing token.** A lease can expire mid-run, briefly allowing two holders. The repo's convention is that every lease-guarded job must be idempotent; needing a fencing token is treated as a design bug in the job.
- **`RELEASED` is `new Date(0)` (Unix epoch), not `new Date()`.** The acquire query uses strict `$lt`; stamping a release with "now" could lose a same-millisecond race. Epoch is `$lt` any real `now`.
- **No TTL index.** Lease rows persist indefinitely until a technician deletes them. A retired job's row stays and keeps firing staleness alerts until removed manually.
- **Failed release/record writes are logged, never thrown.** A write-back failure must not mask the job's own outcome (success or its real error).
- **`recordJobOutcome` sets `owner: 'none'`, `expiresAt: RELEASED` via `$setOnInsert` only**, ensuring a job that never takes a lease has an always-acquirable row and cannot block a concurrent `withLease` for the same name.
- Stryker mutation-testing `disable/restore` markers wrap the two `logger.warn` catch blocks.
