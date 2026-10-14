---
source: src/infrastructure/persistence/lease.ts
sha256: 773559ac4f00cb1561fbb622d0cee1b86b0c0e80915d75bb2d9c9da46fcc61b8
generated_at: 2026-10-14T08:09:40.103505+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/lease.ts

## Purpose

Provides a Mongo-backed mutual-exclusion lease so that a scaled-up cron container cannot run the same periodic job twice in one window. A single atomic upsert decides the winner; the lock lives in the same durable store as the work it guards (no Redis eviction policy to misconfigure). Fencing tokens are intentionally absent — the contract is that every lease-guarded job is idempotent.

## Key elements

- **`LeaseDocument` / `leaseSchema` / `leaseModel`** — Mongoose model on the `leases` collection. `_id` is the job name (not a generated id) so the upsert can address the document without a prior lookup. Fields: `owner`, `expiresAt`, `lastSuccessAt`, `lastError`.
- **`LeaseSummary`** — projected shape (`name`, `lastSuccessAt`, `lastRunAt`, `lastError`) consumed by the observability health endpoint.
- **`listLeaseSummaries()`** — returns every lease row (projected, sorted by `_id`) for health reporting. Only jobs that have at least once touched their lease appear; there is no separate "expected jobs" registry.
- **`acquireLease(name, token, ttlMs)`** *(private)* — one `findOneAndUpdate` upsert. Wins if the lease is missing, expired, or already held by the same token. A duplicate-key error (E11000) on insert means "someone else has it" and is swallowed to `false`.
- **`RELEASED`** *(private)* — `new Date(0)` (Unix epoch). Used as the `expiresAt` value on release so the strict `$lt` in `acquireLease` always sees it as expired, even if release and the next acquisition land in the same millisecond.
- **`releaseLease(name, token, outcome)`** *(private)* — sets `expiresAt: RELEASED` and records `lastSuccessAt` or `lastError`. Filtered on `owner: token` so a late release cannot clobber a new holder. Failures are logged, not thrown.
- **`recordJobOutcome(name, outcome)`** — records a job's result **without** participating in mutual exclusion. Upserts by `_id` alone; `owner`/`expiresAt` are set only `$setOnInsert` (to `RELEASED`), so this never blocks a later `withLease`. Called by `scripts/run-script.ts` for every crontab entry.
- **`withLease<T>(name, ttlMs, run)`** — public entry point. Generates a UUID token, acquires the lease, runs `run()`, releases on both success and throw paths. Returns `undefined` (without calling `run`) if another holder already owns the lease. Rejects with `run`'s own error if it throws.

## Relationships

- **`scripts/ops/*` (reap-inactive-accounts, reap-previous-emails, sweep-preorders, sweep-reservations)** — the periodic jobs that call `withLease` to guarantee single-instance execution.
- **`scripts/run-script.ts`** — calls `recordJobOutcome` for every job (lease-guarded or not) so the health endpoint reflects all crontab entries.
- **`src/infrastructure/adapters/logger.ts`** — provides the `logger` used for non-fatal warnings (failed release, failed record).
- **`src/infrastructure/persistence/mongo-errors.ts`** — provides `isDuplicateKey` to distinguish E11000 from other errors in `acquireLease`.
- **`src/modules/observability/services/job-health.ts`** — consumes `listLeaseSummaries` to power `GET /observability/health`.
- **`src/infrastructure/observability/metrics-registry.ts`** — exports `job_last_run_timestamp_seconds` / `job_last_success_timestamp_seconds` derived from the lease rows.
- **`src/modules/observability/openapi.yaml`** — contract for the health endpoint that reads lease data.
- **`tests/integration/persistence/lease.test.ts`** — integration tests for acquire/release/summary behavior.
- **`tests/unit/scripts/run-script.test.ts`** — verifies `recordJobOutcome` is called for every script.
- **`tests/unit/infrastructure/observability/metrics-registry.test.ts`** — covers the metrics that surface lease summaries.

## Notes

- **No fencing.** A lease can expire mid-run and two holders can briefly coexist. The repo's invariant (stated in `docs/reference/data.md`) is that every `scripts/ops/` job is idempotent. If a job proves not to be, that is treated as a bug in the job, not a missing feature here.
- **`RELEASED` is `Date(0)`, not `Date.now()`.** The acquire query uses strict `$lt`; a release stamped with "now" could be equal to the next acquisition's "now" and lose to itself. Epoch guarantees `$lt` for any real clock.
- **No TTL index.** Lease rows persist indefinitely so a retired job remains visible as stale until manually deleted. Operators see it in the health probe until it is cleaned up.
- **Release/record failures are swallowed (logged, not thrown).** A failed release degrades to "lease expires naturally after `ttlMs`"; a failed record degrades to "health shows stale." Neither should replace the job's own success/error signal.
- **`_id` is the job name.** There is no generated ObjectId. The upsert in `acquireLease` and the upsert in `recordJobOutcome` both rely on this for atomicity without a prior `findOne`.
