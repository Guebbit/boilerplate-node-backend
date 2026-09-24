---
source: src/infrastructure/persistence/lease.ts
sha256: ccf6392b53dfa357046dd3ec66fa23e6b611cc41ff9e92595a6185d899a3893c
generated_at: 2026-09-23T17:50:14.468812+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/lease.ts

## Purpose

Provides a Mongo-backed mutual-exclusion lease so that a scaled-out cron container does not run the same periodic job (e.g. `reap:orders`) twice in the same window. The lock lives in the same store as the work it guards, is durable by construction (no eviction policy), and exposes `lastSuccessAt`/`lastError` fields for the observability health probe.

## Key elements

- **`LeaseDocument` / `leaseSchema` / `leaseModel`** – Mongoose model for the `leases` collection. `_id` is the job name (not a generated id), enabling a single atomic upsert per job without a prior lookup.
- **`listLeaseSummaries()`** – Projects every existing lease document to `{ name, lastSuccessAt, lastError }` for `GET /observability/health`.
- **`withLease(name, ttlMs, run)`** – Public API. Acquires the lease via one `findOneAndUpdate` upsert, runs `run()`, then releases immediately on success *or* throw. Returns `undefined` (without calling `run`) if another holder already owns the lease.
- **`acquireLease`** (module-private) – Atomic upsert; wins when the lease is missing, expired, or already owned by the same token. Catches E11000 to answer "someone else has it" for both first-insert races and different-token conflicts.
- **`releaseLease`** (module-private) – Sets `expiresAt` to the Unix epoch (`RELEASED`) and records the outcome. Filters on `owner: token` so a stale release cannot clobber a new holder. Failures are logged at `warn` level, never thrown.
- **TTL index `leases_updatedAt_ttl`** – On `updatedAt` (not `expiresAt`), driven by `NODE_LEASE_RETENTION_DAYS` (default 30). Garbage-collects leases for retired jobs.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** – Imports `logger`; used in `releaseLease`'s catch to warn about a failed release.
- **`src/infrastructure/persistence/mongo-errors.ts`** – Imports `isDuplicateKey` to identify the E11000 path in `acquireLease`.
- **`src/infrastructure/runtime/environment.ts`** – Imports `environmentNumber` to read `NODE_LEASE_RETENTION_DAYS`.
- **`src/modules/observability/services/job-health.ts`** – Consumes `listLeaseSummaries()` and the `LeaseSummary` shape to populate the health endpoint.
- **`src/modules/observability/openapi.yaml`** – Defines the `GET /observability/health` response contract that `LeaseSummary` satisfies.
- **`src/modules/observability/tests/contract/api.contract.test.ts`** – Contract-tests the health endpoint against the OpenAPI spec; transitively exercises the lease summary fields.
- **`scripts/ops/reap-inactive-accounts.ts`** – A periodic ops script that calls `withLease` to guard its execution window.
- **`tests/integration/persistence/lease.test.ts`** – Integration tests for acquire/release/idempotency behavior of this module.

## Notes

- **No fencing token.** The module docblock explicitly states fencing is out of scope; correctness relies on every lease-guarded job being idempotent. Add a token only for a job proven non-idempotent.
- **`RELEASED = new Date(0)`.** Deliberately the Unix epoch, not `new Date()`, so the strict `$lt` in `acquireLease`'s query cannot miss the lease due to a same-millisecond release→acquire sequence.
- **Changing `NODE_LEASE_RETENTION_DAYS` at runtime does nothing.** Mongo cannot alter an existing index's `expireAfterSeconds` in place; `npm run db:sync` must drop and rebuild the index or the process will fail at boot.
- **Release failure is non-fatal.** A thrown error inside `releaseLease` is caught, logged, and swallowed so it does not mask the job's own outcome. The lease simply rides out its `ttlMs`.
- **`lastSuccessAt` / `lastError` are the only mutable "state" fields** besides `owner`/`expiresAt`; they exist solely for the health probe and have no operational side-effects.
