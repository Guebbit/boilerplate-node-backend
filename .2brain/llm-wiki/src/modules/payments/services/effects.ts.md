---
source: src/modules/payments/services/effects.ts
sha256: 90c1f99ba3495754f3968b28f756c1ab0873c1a0b2f8f932228653a1ce819eb9
generated_at: 2026-10-29T05:10:16.636068+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/effects.ts

## Purpose
Two scheduled sweep operations that finish what a settlement left undone: retrying refunds the provider refused or never acknowledged, and reconciling payments whose provider decided without delivering a webhook. Both sweeps are sequential, batch-capped, and idempotent, mirroring the sweep shape in `orders/services/cancel.ts`.

## Key elements
- **`sweepDue`** (internal) — shared skeleton for both sweeps. Finds a batch of payments past a grace cutoff, processes them one-by-one, logs errors (leaving the payment for the next pass), and warns when the batch hit the 200-item cap so a truncated run isn't mistaken for completion.
- **`retryOpenRefunds`** (exported) — the refund sweep. Calls `paymentRepository.findWithOpenRefunds`, then delegates each payment to `settleOpenRefunds`. Grace period from `paymentEffectRetryMinutes()`.
- **`reconcileStalePayments`** (exported) — the reconciliation sweep. Calls `paymentRepository.findStaleInFlight`, then delegates each payment to `settleFromProvider`. Grace period from `paymentReconcileMinutes()`.
- **`SWEEP_BATCH_SIZE`** — constant (200) capping how many payments one pass touches before the sweep asks to be re-run.
- **`retryOneRefund`**, **`reconcileOne`** — thin per-payment adapters that convert the domain service result into the boolean `sweepDue` expects.

## Relationships
- **`../repository`** — calls `findWithOpenRefunds` and `findStaleInFlight` to select the due batches.
- **`./refunds`** — calls `settleOpenRefunds` per payment in the refund sweep.
- **`./settlement`** — calls `settleFromProvider` per payment in the reconcile sweep.
- **`../config`** — reads `paymentEffectRetryMinutes` and `paymentReconcileMinutes` as the grace windows.
- **`@infrastructure/adapters/logger`** — structured error/warn/info logging for each sweep pass.
- **`../model`** — imports the `PaymentDocument` type used as the unit of work.
- **`../services/index.ts`** — barrel file that re-exports the two public functions.
- **`../jobs.ts`** — the cron/scheduler layer that calls `retryOpenRefunds` and `reconcileStalePayments` on their intervals.

## Notes
- Processing is deliberately **sequential**, not parallel, to match the cancel-sweep convention and keep provider call rates predictable.
- A **full batch (200 items) triggers a warning**, not an error — the caller is expected to re-run the job; the warning exists so a truncated pass isn't silently read as "all done."
- **Hand-paid refunds are explicitly excluded** from the refund sweep; only an operator's manual call can mark them settled.
- The reconcile sweep is safe to run against already-settled payments: `settleFromProvider` uses conditional writes, so a payment the webhook already delivered is a no-op.
- `Stryker` mutation-testing annotations (`// Stryker disable …`) surround every logger call — these are intentional and should not be removed.
