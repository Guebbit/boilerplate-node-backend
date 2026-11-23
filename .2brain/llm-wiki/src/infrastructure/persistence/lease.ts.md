---
source: src/infrastructure/persistence/lease.ts
source_sha256: 22394d173992d39e12d5367294a77876695e17d9fac09d8b6323b5c0ff79d958
context_sha256: 425bdc84baf43ee9e11dc8dc81f5160cc75f1960939df86d8953eeabbea4b0f9
generated_at: 2026-11-22T03:02:57.579756+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/lease.ts

## Purpose
A Mongo-backed mutual-exclusion lease. A single atomic upsert decides which process runs a periodic job, so a scaled-up cron container can't run the same job twice in one window. It also stores each job's last success and last error, which health reporting reads. Fencing is deliberately not implemented. The repo relies on lease-guarded jobs being idempotent instead.

## Key elements
- `LeaseDocument` / `LeaseModel`: the document shape and its Mongoose model type. `_id` is the job name. Fields are `owner`, `expiresAt`, optional `lastSuccessAt` and `lastError`, plus Mongoose timestamps.
- `leaseModel`: the Mongoose model `Lease`, stored in the `leases` collection. `timestamps: true` is on, and no TTL index exists.
- `LeaseSummary`: a job's `name`, `lastSuccessAt`, `lastRunAt` (taken from `updatedAt`) and `lastError`.
- `listLeaseSummaries()`: returns every lease document, projected to `LeaseSummary` and sorted by `_id`.
- `withLease(name, ttlMs, run)`: the main entry point. It runs `run` only if the lease is acquired, and returns `undefined` without calling `run` if another holder has it. It releases the lease on both success and throw. The result of `run` passes through, and a throw from `run` is rethrown after release.
- `recordJobOutcome(name, outcome)`: upserts the outcome (`lastSuccessAt`, or `lastError`) without taking a lease. A new row gets `owner: 'none'` and an already-expired `expiresAt`. Failures are logged and swallowed.
- Internal `acquireLease`: one `findOneAndUpdate` upsert. It matches when the lease is missing, expired (`expiresAt < now`), or already owned by the same token. A duplicate-key error (via `isDuplicateKey`) means "someone else holds it" and returns `false`. Other errors are rethrown.
- Internal `releaseLease`: filters on `owner: token`. It sets `expiresAt` to `RELEASED` and records either `lastSuccessAt` (clearing `lastError`) or `lastError`. A failed release is logged and swallowed.
- `RELEASED`: `new Date(0)`, the Unix epoch, used as the expiry for released leases.

## Relationships
- `@infrastructure/persistence/mongo-errors`: supplies `isDuplicateKey`, which `acquireLease` uses to detect lost races.
- `@infrastructure/adapters/logger`: used to warn when a release or an outcome record fails.
- `@guebbit/js-toolkit`: `extractErrorMessage` turns a thrown value into the stored `lastError` string.
- `scripts/run-script.ts`: calls `recordJobOutcome` for every crontab job, whether or not it is lease-guarded.
- `scripts/ops/prepare-job.ts`: a related ops script. The code states that `scripts/ops/` jobs must be idempotent.
- `src/modules/observability/services/job-health.ts`: reads lease data via `listLeaseSummaries` for `GET /observability/health`.
- `src/infrastructure/observability/metrics-registry.ts`: exports the job timestamps (`job_last_success_timestamp_seconds`, `job_last_run_timestamp_seconds`) from the lease data.
- `tests/integration/persistence/lease.test.ts` covers this file directly. The other listed tests (the observability contract test, `command-metrics`, `metrics-registry` and `run-script` tests) are related through the dependency graph.

## Notes
- `RELEASED` is the epoch rather than `new Date()` because `acquireLease` uses a strict `$lt`. A release stamped "now" could tie with the next acquisition's `now` in the same millisecond and lose that race.
- The duplicate-key branch in `acquireLease` handles two cases the same way: a contended first insert, and a live lease held by a different token. Both mean "someone else has it".
- A lease can expire while its holder is still running, so two holders can briefly coexist. This is accepted, with idempotent jobs as the mitigation.
- Rows are never expired automatically. A retired job's row stays and reads as stale until someone deletes it by hand, so staleness alerts keep firing. No registry of expected job names exists.
- `lastRunAt` means the row was last touched (an outcome recorded, or a lease taken or released), not that the job succeeded.
- `releaseLease` and `recordJobOutcome` wrap their warn logs in `// Stryker disable all` / `restore all`, which excludes them from mutation testing.
