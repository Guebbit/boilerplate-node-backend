---
source: src/modules/users/jobs.ts
sha256: a518f642703225017e2c36b7b31b05c53401e79b33bc4ca31b098502fd006362
generated_at: 2026-11-08T08:46:15.793102+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/jobs.ts

## Purpose
Declares the scheduled job(s) owned by the `users` module. Currently exposes a single nightly job that reaps expired purchase holds, wiring together the domain service, structured logging, and a lease TTL so the kernel scheduler can dispatch it safely.

## Key elements
- **`usersJobs`** (export, `readonly JobDeclaration[]`) — The sole public export. An array of job declarations consumed by the kernel registry. Each entry spreads pre-generated metadata from `usersJobData.reapPurchaseHolds` (id, schedule, etc.) and supplies:
  - `run` — Async callback that calls `reapExpiredPurchaseHolds()`, logs the reduced count via `logger.info`, and returns `{ reduced }`.
  - `lease.ttlMs` — Set to `15 * MINUTE_MS` (15 minutes), governing how long the lease on this job is held during execution.

## Relationships
- **`src/kernel/registry.ts`** — Provides the `JobDeclaration` type that shapes every object in `usersJobs`; the kernel registry is the consumer of this array.
- **`src/modules/users/services/purchase-hold.ts`** — Source of `reapExpiredPurchaseHolds`, the actual business logic the job's `run` callback delegates to.
- **`src/infrastructure/adapters/logger.ts`** — Provides the `logger` instance used to emit a structured info log after a successful reap.
- **`src/domain-primitives/time.ts`** — Supplies the `MINUTE_MS` constant used to compute the 15-minute lease TTL.
- **`src/modules/users/module.ts`** — Parent module that registers `usersJobs` with the kernel so the scheduler picks them up.

## Notes
- Job metadata (id, schedule, display name) is **not** hand-written here; it is spread in from `./jobs.generated` (`usersJobData`). Edit the generator or its source-of-truth, not this file, when changing schedule or identifiers.
- The `run` callback is synchronous at declaration time but returns a `Promise` (via `.then`). The kernel is expected to await it within the lease window.
- The 15-minute lease is a hard-coded default. If `reapExpiredPurchaseHolds` ever grows beyond that on large datasets, the lease must be increased to avoid mid-run expiration.
