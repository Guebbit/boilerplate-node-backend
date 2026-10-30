---
source: src/modules/payments/jobs.ts
sha256: 7fc0d777424a4571fa9903ab3de58afb52d322779e80bed69e1cb6c4159d86bb
generated_at: 2026-10-29T05:06:32.328734+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/jobs.ts

## Purpose

Declares the two scheduled jobs the `payments` module owns—abandoned-attempt reaping and effect sweeping—as a readonly array of `JobDeclaration` objects. It wires generated schedule metadata to the actual service functions that do the work, so the kernel can discover and run them.

## Key elements

- **`paymentsJobs`** (exported, `readonly JobDeclaration[]`) — The sole export. Two entries:
  - `reapPayments` — delegates to `reapAbandonedPayments()`; no lease.
  - `sweepPaymentEffects` — runs `retryOpenRefunds()` then `reconcileStalePayments()` sequentially; carries a 10-minute lease (`ttlMs: 10 * 60_000`).
- Each entry spreads its schedule/interval metadata from `paymentsJobData` (see generated file) and supplies a `run` function.

## Relationships

- **`src/kernel/registry.ts`** — Provides the `JobDeclaration` type that shapes the exported array.
- **`src/modules/payments/jobs.generated.ts`** — Supplies `paymentsJobData` (names, intervals, cron expressions) that is spread into each declaration.
- **`src/modules/payments/services/retention.ts`** — Source of `reapAbandonedPayments`, the work function for the reaper job.
- **`src/modules/payments/services/effects.ts`** — Source of `retryOpenRefunds` and `reconcileStalePayments`, the work functions for the sweep job.
- **`src/modules/payments/module.ts`** — Expected consumer that registers `paymentsJobs` with the kernel's job scheduler.
- **`src/modules/payments/tests/unit/jobs.test.ts`** — Unit tests exercising the declarations and run wiring.

## Notes

- The 10-minute lease on `sweepPaymentEffects` is intentional: a hung provider can push a pass past the 5-minute interval, and the lease prevents a second pass from reusing the same idempotency keys while the first is still in flight.
- The sweep job's two calls are strictly sequential (`.then`), not parallel—reconciliation depends on refunds having been attempted first.
- Schedule metadata lives in the generated file; this file only binds metadata to execution logic. Regenerating `jobs.generated.ts` will change intervals without touching this file.
