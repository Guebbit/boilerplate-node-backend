---
source: src/infrastructure/persistence/lease.ts
sha256: dc6854d0dc53f25763a8f09e60e2225ffe524c05f50cb5b186af905333695812
generated_at: 2026-09-27T14:14:08.243900+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/lease.ts

## Purpose

Provides a Mongo-backed mutual-exclusion lease so that a scaled-up cron container cannot run the same periodic job twice in one window. A single atomic `findOneAndUpdate` upsert decides the holder; the lease lives in the same durable store as the work it guards (recommended over a Redis lock). Fencing is intentionally absent — all lease-guarded jobs are required to be idempotent.

## Key elements

- **`withLease<T>(name, ttlMs, run)`** — Public API. Acquires the lease, runs `run()`, releases immediately on success or throw. Returns `undefined` (without calling `run`) if another holder already owns the lease.
- **`recordJobOutcome(name, outcome)`** — Public API. Upserts a lease row with `lastSuccessAt`/`lastError` *without* participating in mutual exclusion. Called by `scripts/run-script.ts` for every crontab job, lease-guarded or not.
- **`listLeaseSummaries()`** — Projects all existing lease documents to `{ name, lastSuccessAt, lastError }` for the observability health endpoint.
- **`leaseSchema` / `leaseModel`** — Mongoose schema and model. `_id` is the job name string. A TTL index on `updatedAt` (not `expiresAt`) garbage-collects abandoned leases after `NODE_LEASE_RETENTION_DAYS` (default 30).
- **`acquireLease` (private)** — Single atomic upsert; wins if the lease is missing, expired, or already owned by the same token. E11000 duplicate-key on a foreign non-expired lease → returns `false`.
- **`releaseLease` (private)** — Sets `expiresAt` to the Unix epoch (`RELEASED`) and records the outcome. Filtered on `owner: token` so it never clobbers a successor's lease.
- **`RELEASED`** — `new Date(0)`. Using epoch (not "now") avoids a same-millisecond race against `acquireLease`'s strict `$lt` comparison.
- **`LeaseSummary`** — Interface consumed by the health service.

## Relationships

- **`scripts/run-script.ts`** — Calls `recordJobOutcome` for every job after execution, regardless of whether `withLease` was used.
- **`scripts/ops/reap-inactive-accounts.ts`** — A lease-guarded job that consumes `withLease`.
- **`src/infrastructure/adapters/logger.ts`** — Imported; `releaseLease` and `recordJobOutcome` log warnings (not throws) on write failure.
- **`src/infrastructure/persistence/mongo-errors.ts`** — Provides `isDuplicateKey`, used by `acquireLease` to convert E11000 into a `false` return.
- **`src/infrastructure/runtime/environment.ts`** — Provides `environmentNumber` to read `NODE_LEASE_RETENTION_DAYS` for the TTL index.
- **`src/infrastructure/observability/metrics-registry.ts`** — Publishes `job_last_success_timestamp_seconds` derived from the same lease rows.
- **`src/modules/observability/services/job-health.ts`** — Calls `listLeaseSummaries` to populate `GET /observability/health`.
- **`src/modules/observability/openapi.yaml`** — Contract for that health endpoint; this file's `LeaseSummary` shape must stay in sync.
- **`tests/integration/persistence/lease.test.ts`** — Integration tests exercising acquire/release races.
- **`tests/unit/scripts/run-script.test.ts`** — Verifies `recordJobOutcome` is called for every job.

## Notes

- **No fencing token.** A lease can expire mid-run; two holders can briefly coexist. The repo's contract is that every guarded job is idempotent (`docs/reference/data.md`). Introducing a fencing token for a single job is a signal that the job itself is mis-designed.
- **TTL index is on `updatedAt`, not `expiresAt`.** `timestamps: true` bumps `updatedAt` on every acquire/release, so an actively running job never hits the retention window. Only a truly abandoned job (nobody touching it for `leaseRetentionDays`) gets collected.
- **Changing `NODE_LEASE_RETENTION_DAYS` at runtime does nothing.** Mongo cannot alter an existing index's `expireAfterSeconds` in place. A restart alone fails the boot; `npm run db:sync` must drop and rebuild the index.
- **`recordJobOutcome` never blocks `withLease`.** It sets `owner`/`expiresAt` only via `$setOnInsert` (already at `RELEASED`), so a non-lease job's row is always immediately acquirable.
- **Release/recording failures are logged, not thrown.** A failed release simply means the lease rides out its `ttlMs`; the job's real outcome is preserved.
- **`_id` is the job name string**, not a generated ObjectId. This is what makes the single-upsert acquire possible without a prior lookup.
