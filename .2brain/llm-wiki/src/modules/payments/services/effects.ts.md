---
source: src/modules/payments/services/effects.ts
sha256: 450d122cc03c662daeb5947f414476a0f6823032a4645e069173ee227d9bbe09
generated_at: 2026-10-15T11:29:20.787365+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/effects.ts

## Purpose

Background sweep that finishes work left incomplete by the normal settlement flow: retries refunds the provider refused or never answered, and asks the provider about payments that settled without a webhook arriving. Exports two entry points (`retryOpenRefunds`, `reconcileStalePayments`) intended to be called on a schedule.

## Key elements

- **`sweepDue`** (internal) — shared skeleton for both sweeps. Fetches one batch of due payments, processes them sequentially via a caller-supplied handler, warns if the batch hit the 200-payment cap, and returns the settled count.
- **`retryOneRefund`** (internal) — wraps `settleOpenRefunds` for a single payment; logs and returns `false` on error so the payment stays open for the next sweep.
- **`retryOpenRefunds`** (exported) — the refund sweep. Uses `paymentRepository.findWithOpenRefunds` with a grace period from `paymentEffectRetryMinutes()`.
- **`reconcileOne`** (internal) — wraps `settleFromProvider` for a single payment; counts it settled only if the provider's answer actually transitioned the payment's status. Logs and returns `false` on error.
- **`reconcileStalePayments`** (exported) — the reconcile sweep. Uses `paymentRepository.findStaleInFlight` with a grace period from `paymentReconcileMinutes()`.
- **`SWEEP_BATCH_SIZE`** — constant `200`; caps how many payments one pass touches.

## Relationships

- **`./refunds.ts`** — calls `settleOpenRefunds(payment)` per payment in the refund sweep; reuses the same idempotency keys so a re-ask is safe.
- **`./settlement.ts`** — calls `settleFromProvider(payment)` per payment in the reconcile sweep; the write is conditional, so a webhook-delivered payment is a no-op.
- **`../repository.ts`** — provides `paymentRepository.findWithOpenRefunds` and `paymentRepository.findStaleInFlight` as the "find" callbacks.
- **`../model.ts`** — `PaymentDocument` is the unit passed through the sweep.
- **`../config.ts`** — supplies the two grace-period functions (`paymentEffectRetryMinutes`, `paymentReconcileMinutes`).
- **`../../infrastructure/adapters/logger.ts`** — all warn/error/info output.
- **`./index.ts`** — re-exports the two public functions for module consumers.
- **Tests** — `reconcile.test.ts`, `refunds.test.ts`, and `service.test.ts` exercise these sweeps end-to-end; `cancelled.test.ts` and `staff-reads.test.ts` cover adjacent paths that share the same repository queries.

## Notes

- Processing is **sequential**, not parallel — intentional, mirroring `orders/services/cancel.ts`'s sweep. Do not add concurrency without understanding the provider's rate limits and the conditional-write guarantees in `settlement.ts`.
- A "settled" count in `reconcileStalePayments` means the payment **changed state** this pass (`transitioned === true` and status differs). A payment the provider was still undecided about, or one that lost a race, does **not** increment the count.
- Hand-paid refunds are explicitly out of scope for the refund sweep; only an operator's manual call can close them.
- Stryker mutation-testing disable/restore annotations guard the log-only branches — keep them if you refactor the logging lines.
- The batch-cap warning is the **only** signal that work remains; callers should loop or re-schedule until the returned count drops below the batch size.
