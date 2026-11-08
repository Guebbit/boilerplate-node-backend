---
source: src/infrastructure/persistence/lease.ts
sha256: 639c1f74496526c453f95a51e55cc89d379e7409dc84c9d20217f38513fd336f
generated_at: 2026-11-08T03:43:15.108524+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/lease.ts

## Purpose

Provides a MongoDB-backed mutual-exclusion lease so that a scaled-out cron container fleet runs a periodic job exactly once per window. One atomic `findOneAndUpdate` upsert decides the holder; no separate lock store (e.g. Redis) is needed. Fencing tokens are deliberately omitted—the repo contract requires every lease-guarded job to be idempotent.

## Key elements

- **`LeaseDocument`** – Interface for the `leases` collection. `_id` is the job name (not a generated id); carries `owner`, `expiresAt`, `lastSuccessAt`, `lastError`.
- **`leaseModel`** – Mongoose model (collection `leases`, `timestamps: true`). No TTL index; rows persist until manually deleted so a retired job stays visible as stale.
- **`LeaseSummary`** – Projected shape (`name`, `lastSuccessAt`, `lastRunAt`, `lastError`) consumed by the health endpoint.
- **`listLeaseSummaries()`** – Returns all lease documents projected to `LeaseSummary[]`, sorted by name. Only jobs that have attempted acquisition appear here; there is no separate "expected jobs" registry.
- **`withLease<T>(name, ttlMs, run)`** – Main entry point. Generates a UUID token, acquires the lease atomically, runs `run()`, and releases (recording success or failure) on both paths. Returns `undefined` without calling `run` if another holder already owns the lease.
- **`recordJobOutcome(name, outcome)`** – Upserts the lease row with the job's result *without* participating in mutual exclusion. Used by `scripts/run-script.ts` so every crontab job (lease-guarded or not) is visible to health/metrics.
- **`acquireLease`** (private) – Single `findOneAndUpdate` with `$or` on expiry/ownership; a duplicate-key (E11000) response means "someone else has it" and is returned as `false`.
- **`releaseLease`** (private) – Sets `expiresAt` to the Unix epoch (`RELEASED`) so the next acquisition's strict `$lt` check succeeds even within the same millisecond. Filters on `owner: token` so a stale release cannot clobber a new holder.
- **`RELEASED`** – `new Date(0)` constant; the sentinel value meaning "no active holder."

## Relationships

- **`src/infrastructure/adapters/logger.ts`** – `logger.warn` is called when `releaseLease` or `recordJobOutcome` fails, preventing a release/recording error from masking the job's real outcome.
- **`src/infrastructure/persistence/mongo-errors.ts`** – `isDuplicateKey` is used in `acquireLease` to distinguish an E11000 (lease contention) from a genuine error.
- **`src/modules/observability/services/job-health.ts`** – Consumes `listLeaseSummaries` to build the `GET /observability/health` response; `lastRunAt` / `lastSuccessAt` are surfaced there.
- **`src/infrastructure/observability/metrics-registry.ts`** – Exports `job_last_success_timestamp_seconds` and `job_last_run_timestamp_seconds` from the same lease data.
- **`scripts/run-script.ts`** – Calls `recordJobOutcome` for every job (lease-guarded or not) so health and metrics cover the full crontab.
- **`scripts/ops/run-job.ts`** – Expected caller of `withLease` for lease-guarded periodic jobs.
- **`tests/integration/persistence/lease.test.ts`** – Integration tests for acquire/release/contention semantics.
- **`tests/unit/scripts/run-script.test.ts`** – Verifies that `recordJobOutcome` is invoked for each job.
- **`tests/unit/infrastructure/observability/metrics-registry.test.ts`** – Tests metric exports that read lease-derived timestamps.
- **`src/modules/observability/tests/contract/api.contract.test.ts`** – Contract-tests the health endpoint that surfaces `LeaseSummary` fields.

## Notes

- **No fencing.** Two holders can briefly coexist if one crashes mid-run. The repo contract (`docs/reference/data.md`) mandates idempotency of all `scripts/ops/` jobs; needing a fencing token is treated as a bug signal, not a feature to add.
- **`RELEASED` = epoch, not `new Date()`.** A release and the next acquire can share a millisecond; a strict `$lt` comparison against "now" would fail on equality. Epoch is always strictly less than any real timestamp.
- **Release failures are swallowed (logged, not thrown).** A failed release simply lets the lease ride out `ttlMs`, identical to a crash. Throwing would replace the job's real success/error with an infrastructure error.
- **`recordJobOutcome` upserts with `$setOnInsert` for `owner`/`expiresAt`.** A job that never calls `withLease` still gets a row, but it is always immediately acquirable and never blocks a later `withLease` for the same name.
- **`_id` is the job name.** There is no separate lookup step; the upsert targets the document directly by name.
- **Stryker markers** (`// Stryker disable all` … `// Stryker restore all`) wrap the two `logger.warn` fallback paths to exclude them from mutation-testing coverage.
