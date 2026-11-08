---
source: src/modules/payments/jobs.ts
sha256: 048515419179b017b2d45b7ea57d9fdf2f5c6d58bfba544c777a1f5d88c0853b
generated_at: 2026-11-08T07:21:27.766563+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/jobs.ts

## Purpose

Declares the two scheduled jobs owned by the `payments` module: the abandoned-attempt reaper and the effect-retry sweep. Each entry is a `JobDeclaration` that binds a pre-generated job descriptor (from `jobs.generated`) to the concrete service function(s) that perform the work.

## Key elements

- **`paymentsJobs: readonly JobDeclaration[]`** — the sole export. A two-element array:
  - *Reap payments* — calls `reapAbandonedPayments()` on its interval.
  - *Sweep payment effects* — runs `retryOpenRefunds()` then `reconcileStalePayments()` sequentially; configured with a 10-minute lease (`ttlMs`) to prevent a second pass from issuing the same idempotency keys while a hung provider is still in-flight.

## Relationships

- **`src/kernel/registry.ts`** — supplies the `JobDeclaration` type that each array element conforms to.
- **`src/modules/payments/services/retention.ts`** — source of `reapAbandonedPayments`, wired into the first job.
- **`src/modules/payments/services/effects.ts`** — source of `retryOpenRefunds` and `reconcileStalePayments`, wired into the second job.
- **`src/domain-primitives/time.ts`** — provides `MINUTE_MS` used in the lease TTL calculation.
- **`src/modules/payments/module.ts`** — the module entry point that (transitively) registers `paymentsJobs` with the scheduler.
- **`src/modules/payments/tests/unit/jobs.test.ts`** — unit tests for the job declarations and wiring.

## Notes

- The job metadata (name, interval, etc.) is **not** hand-written here; it comes from `./jobs.generated`. Editing schedule or name should happen in the generator's source, not in this file.
- The sweep job's `.then()` chain means a failure in `retryOpenRefunds` skips `reconcileStalePayments` for that pass—there is no independent retry of the second step.
- The 10-minute lease is deliberately double the stated 5-minute interval (per the inline comment) to tolerate a single hung provider pass without double-firing idempotency keys.
