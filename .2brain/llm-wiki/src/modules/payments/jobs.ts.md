---
source: src/modules/payments/jobs.ts
source_sha256: 5545eb48b81e97def90a8963f86768965ff252843b8a21d838e0c8f64bc65044
context_sha256: 6679d2ad72d9e87d433ac618de593c8c0b8a4100ae0c9c0ea91b955557921311
generated_at: 2026-11-22T06:45:38.393401+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/jobs.ts

## Purpose
Declares the scheduled jobs owned by the `payments` module: the abandoned-payment reaper and the periodic payment-effects sweep (refund retries and stale-payment reconciliation). It pairs each job's generated scheduling data with the function that runs it, so the kernel registry can schedule them.

## Key elements
- `paymentsJobs: readonly JobDeclaration[]` — the module's job list, with two entries:
  - **reapPayments** — spreads `paymentsJobData.reapPayments` and runs `reapAbandonedPayments()`.
  - **sweepPaymentEffects** — spreads `paymentsJobData.sweepPaymentEffects` and runs `retryOpenRefunds()` followed by `reconcileStalePayments()`. It has a lease with `ttlMs` of 10 minutes (`10 * MINUTE_MS`).

## Relationships
- `src/kernel/registry.ts` — supplies the `JobDeclaration` type that each entry conforms to.
- `src/modules/payments/services/retention.ts` — provides `reapAbandonedPayments`, called by the reap job.
- `src/modules/payments/services/effects.ts` — provides `retryOpenRefunds` and `reconcileStalePayments`, called in sequence by the sweep job.
- `src/domain-primitives/time.ts` — provides `MINUTE_MS`, used for the lease TTL.
- `src/modules/payments/module.ts` — a graph neighbor; this file does not import it.
- Tests: `src/modules/payments/tests/unit/jobs.test.ts` and `tests/integration/ops-payment-effects-job.test.ts` cover these jobs.

## Notes
- Per-job metadata (such as intervals) is not defined here. It comes from the generated `paymentsJobData`, imported from `./jobs.generated`.
- The sweep runs its two steps sequentially, and `reconcileStalePayments` only starts after `retryOpenRefunds` resolves.
- The lease exists because a hung provider can keep one pass running past its interval. It stops a second pass from sending the same idempotency keys while the first is still running.
