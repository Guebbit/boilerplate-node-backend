---
source: src/modules/users/jobs.ts
sha256: c37596d03eba760958f27d25b44b108e8c09d58aea6f552e6255c9a1a9a5b144
generated_at: 2026-10-29T06:13:03.817022+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/jobs.ts

## Purpose

Declares the scheduled jobs owned by the `users` module. Currently a single job — the nightly reaping of expired purchase holds — is registered here so the scheduler can discover and execute it.

## Key elements

- **`usersJobs`** (export) — `readonly JobDeclaration[]` containing exactly one entry. This is the canonical list the scheduler (via `module.ts`) consumes to wire up job execution.
- **`reapPurchaseHolds` job entry** — Spreads base metadata (name, schedule, etc.) from `usersJobData.reapPurchaseHolds` (generated), then supplies a hand-written `run` function and a 15-minute lease.
  - `run`: Calls `reapExpiredPurchaseHolds()`, logs an `info` entry with the number of holds reduced, and returns `{ reduced }` as the job result.
  - `lease.ttlMs`: Set to 15 min (900 000 ms) — the maximum time the job is expected to hold its lease before being considered stuck.

## Relationships

- **`src/kernel/registry.ts`** — Imports the `JobDeclaration` type used to type the array and each entry.
- **`src/modules/users/jobs.generated.ts`** — Provides `usersJobData.reapPurchaseHolds`, the generated base metadata (schedule, id, etc.) that is spread into the job object.
- **`src/modules/users/services/purchase-hold.ts`** — Provides `reapExpiredPurchaseHolds`, the actual business logic executed by the job's `run` function.
- **`src/infrastructure/adapters/logger.ts`** — Provides `logger` used to emit an `info` log line after a successful run.
- **`src/modules/users/module.ts`** — Consumes `usersJobs` to register the job with the scheduler on module initialization.

## Notes

- Job metadata (name, cron/schedule, id) lives in `jobs.generated.ts`; only `run` and `lease` are hand-written here. If you change the schedule, edit the generator, not this file.
- The `run` function is fire-and-forget from the caller's perspective: it returns a Promise that resolves to `{ reduced: number }`. Errors propagate as a rejected Promise back to the scheduler.
