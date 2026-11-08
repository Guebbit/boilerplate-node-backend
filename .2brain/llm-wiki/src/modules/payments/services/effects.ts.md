---
source: src/modules/payments/services/effects.ts
sha256: 15c4e182d8bdbc29d9e0da68c12140d8bc1ae4758391ef51572c875170d81e02
generated_at: 2026-11-08T07:25:50.932035+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/effects.ts

## Purpose

Provides two scheduled sweep operations that finish work a settlement left outstanding: retrying refunds the provider refused or never answered, and reconciling payments whose provider decided without delivering a webhook. Both sweeps share a sequential, batch-capped skeleton and return a count of items actually settled.

## Key elements

- **`sweepDue`** (internal) — Shared skeleton: computes a cutoff date, fetches one batch via a caller-supplied `find` function, iterates sequentially calling `handle` on each payment, logs errors per-item, warns when the batch hit the 200-item cap (signalling more work remains), and returns the settled count.
- **`retryOpenRefunds`** (exported) — Sweep for the refund half: finds payments with open refunds older than `paymentEffectRetryMinutes()`, delegates each to `settleOpenRefunds`, counts settlements.
- **`reconcileStalePayments`** (exported) — Sweep for the reconcile half: finds stale in-flight payments older than `paymentReconcileMinutes()`, delegates each to `settleFromProvider`, counts payments that actually transitioned.
- **`retryOneRefund`** / **`reconcileOne`** (internal) — Per-payment adapters that unwrap the richer return types of `settleOpenRefunds` / `settleFromProvider` into a plain boolean for the sweep loop.
- **`SWEEP_BATCH_SIZE`** — Constant (200); the cap on payments processed per pass.

## Relationships

- **`refunds.ts`** — Imports `settleOpenRefunds`; the refund sweep delegates all per-payment refund logic to it.
- **`settlement.ts`** — Imports `settleFromProvider`; the reconcile sweep delegates the provider query + conditional write to it.
- **`repository.ts`** — Calls `paymentRepository.findWithOpenRefunds` and `paymentRepository.findStaleInFlight` to source each batch.
- **`config.ts`** — Reads `paymentEffectRetryMinutes()` and `paymentReconcileMinutes()` for the grace-period cutoffs.
- **`model.ts`** — Uses the `PaymentDocument` type as the unit of work passed through the sweep.
- **`time.ts`** — Uses `MINUTE_MS` to convert grace minutes into a millisecond offset.
- **`logger.ts`** — Emits error (per-item failure), warn (batch cap hit), and info (batch summary) lines.
- **`services/index.ts`** — Re-exports the two public sweep functions to the rest of the module.
- **`jobs.ts`** — Upstream caller that schedules these sweeps on a cron/interval basis.

## Notes

- **Sequential by design.** The sweep uses a `for…of` loop (not `Promise.all`) to avoid hammering the provider; this is intentional and mirrors the pattern in `orders/services/cancel.ts`.
- **Batch-cap warning is a signal, not an error.** A `warn` line at the end of a pass means the queue was truncated at 200 and the job should be re-run; it does not indicate failure.
- **Idempotency relies on the settlement layer.** Retrying a refund re-sends the same idempotency key; reconciling a stale payment uses conditional writes inside `settleFromProvider`. The sweep itself performs no deduplication.
- **Hand-paid refunds are excluded.** `retryOpenRefunds` only touches provider-initiated refunds; a manually-recorded cash refund is never "settled" by this sweep.
- **`reconcileOne` compares status before/after.** A settlement that returns `transitioned: true` but leaves the status unchanged (e.g., provider still undecided) is counted as *not* settled.
- **Stryker mutation suppression** wraps the error-catch and log branches—treated as untestable-by-mutation intentionally.
