---
source: src/modules/payments/services/effects.ts
source_sha256: 15c4e182d8bdbc29d9e0da68c12140d8bc1ae4758391ef51572c875170d81e02
context_sha256: d0a22153ec8d1ed32027d26db7c83aa218f7219700796b5ba69068ce9c1b5c25
generated_at: 2026-11-22T06:49:53.964296+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/effects.ts

## Purpose
Holds the two background sweeps that finish what a settlement left owing. One retries open refunds the provider refused or never answered. The other reconciles payments whose provider decided without telling us, which is the safety net under a lost webhook. Both share one sequential, batch-capped skeleton, modeled on the sweep in `src/modules/orders/services/cancel.ts`.

## Key elements
- `retryOpenRefunds()` (exported): sweeps payments with open refunds and resolves to how many had at least one refund settled. It resends the same records with the same idempotency keys, so a provider that already returned the money answers with the existing refund instead of paying twice. Its grace period is `paymentEffectRetryMinutes()`.
- `reconcileStalePayments()` (exported): sweeps unsettled payments that hold a provider intent and resolves to how many moved to a new state. Its grace period is `paymentReconcileMinutes()`.
- `sweepDue(find, handle, label, graceMinutes)` (private): the shared skeleton.
  - It computes a cutoff of now minus the grace period.
  - It fetches up to `SWEEP_BATCH_SIZE` (200) payments and handles them one at a time.
  - A rejection from `handle` is logged and counted as not settled, which leaves that payment for the next sweep.
  - It warns when the batch is full, so a truncated run is not read as done.
  - It logs an info line with the settled count when anything was due.
- `retryOneRefund(payment)` (private): calls `settleOpenRefunds` and returns `outcome.settled`.
- `reconcileOne(payment)` (private): calls `settleFromProvider` and returns true only if the settlement reports `transitioned === true` and the payment's status differs from `settlement.payment.status`.

## Relationships
- `../repository`: `paymentRepository` supplies each sweep's batch of due payments, through its open-refund and stale-in-flight finders.
- `../config`: `paymentEffectRetryMinutes` and `paymentReconcileMinutes` set the per-sweep grace periods.
- `./refunds`: `settleOpenRefunds` does the actual refund retry.
- `./settlement`: `settleFromProvider` is the same settlement path the webhook, confirm and sync use.
- `../model`: provides the `PaymentDocument` type.
- `@infrastructure/adapters/logger`: error, warn and info logging.
- `@domain-primitives/time`: `MINUTE_MS` converts the grace minutes to milliseconds.
- `../jobs` and `./index`: these are graph neighbors, but this file does not import them.

## Notes
- Payments are handled sequentially, not in parallel. One pass is capped at 200 payments, so a full batch means the sweep must be run again to continue.
- A hand-paid refund is never finished by the refund sweep. Only an operator's own call may say the cash went back.
- Reconciliation is safe against a webhook that did arrive. Every write in the settlement is conditional, and a settled payment is not asked about at all, so the sweep is a no-op in that case.
- `reconcileOne` reports true only when this call's own write moved the payment. A call that lost a race, or found the provider still undecided, does not count.
- The log calls are wrapped in Stryker mutation-testing disable comments.
