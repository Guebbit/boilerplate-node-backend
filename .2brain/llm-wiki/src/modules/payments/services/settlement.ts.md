---
source: src/modules/payments/services/settlement.ts
sha256: 00563bc6c4d7ad290854023bed1bf1b5dca470554d6e1f6f0b9d2d6cac63b602
generated_at: 2026-10-29T05:14:01.155250+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/settlement.ts

## Purpose

The single reconciliation point for payment success. Whether the signal arrives via a browser-driven confirm/sync poll or a provider webhook, both paths funnel into this file's settlement logic so that money is reconciled exactly once. It handles both the happy path (provider confirms the frozen payment) and the mismatch path (provider reports a success whose amount, currency, or payment id disagrees with what was frozen), ensuring the order is either marked paid or cancelled with a refund opened atomically.

## Key elements

- **`Settlement`** (interface) — the result shape returned to callers: the updated payment document, an `orderLost` flag (money arrived after the order could no longer be paid), and a `transitioned` flag (whether *this* call's write landed vs. losing the race to a concurrent caller).
- **`receiptMismatch`** — compares the provider's reported `amountReceived`, `currency`, and `paymentId` against the frozen payment fields. Amounts are compared in minor units to eliminate float noise. Returns the list of disagreeing fields.
- **`returnMismatchedMoney`** — post-commit follow-up for a mismatch: cancels the order via `orderService.cancelForPaymentMismatchById`, then calls `performRefund`. Both steps are fire-and-log; failures are retried by reservation expiry and the refund sweep respectively.
- **`settleMismatch`** — the full mismatch settlement: within one transaction, conditionally overwrites the payment status to `succeeded` (recording what actually arrived), opens a refund record, enqueues a `PAYMENT_AMOUNT_MISMATCH` outbox event, and marks the order's money received. After commit, emits analytics, records audit, and kicks off `returnMismatchedMoney`.
- **`SettlementOutcome`** (type) — discriminated union for what the atomic transaction decided: `replay` (someone else already settled), `paid` (order moved to paid), or `lost` (order no longer payable; refund opened).
- **`settleWithin`** — the one atomic database step for the success branch: conditionally writes `succeeded`, calls `orderService.markPaid` (which also commits the stock hold), or—when the order has moved past payment—opens a refund. Database-only by design; the Mongoose session driver may re-run the callback on transient errors, so no external I/O is allowed inside.
- **`settlePayment`** (implied main export, referenced in the module doc) — the public entry point both the confirm/sync endpoint and the webhook handler call.

## Relationships

- **`src/domain-primitives/money.ts`** — `toMinorUnits` is used by `receiptMismatch` to compare amounts without float artifacts.
- **`src/modules/orders/services/index.ts` / `src/modules/orders/index.ts`** — imports `orderService` and `paymentSettled`. Calls `orderService.markPaid`, `orderService.cancelForPaymentMismatchById`, and `orderService.markMoneyReceived` within the settlement transaction.
- **`src/modules/orders/domain/lifecycle.ts`** — the order state machine that `markPaid` and `cancelForPaymentMismatchById` advance; the "lost" branch fires when the order has already left the payable window.
- **`src/kernel/outbox.ts`** — `enqueueOutboxEvent` persists domain events (`PAYMENT_AMOUNT_MISMATCH`, `PAYMENT_SUCCEEDED`) inside the same transaction; `nudgeOutbox` triggers delivery after commit.
- **`src/kernel/permissions.ts`** — `systemCallerContext('Payment')` provides the actor identity for audit records written during mismatch handling.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps the settlement writes so payment status, order move, refund record, and outbox rows commit atomically.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` / `buildAnalyticsBase` fire post-commit analytics (e.g., `paymentAmountMismatchTotal`).
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` logs the mismatch event with expected vs. received figures.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` records mismatch details and non-fatal cancel/refund failures.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` types shape the HTTP answer the caller builds from the `Settlement` result.
- **`src/infrastructure/i18n/index.ts`** — `t` for localized user-facing messages in responses.
- **`src/modules/payments/analytics.ts`** — `paymentsAnalyticsEvents` supplies the event descriptors emitted on settle.

## Notes

- **Exactly-once guarantee** relies on the conditional write gate: `updateStatusIfIn` checks membership in `SUCCESS_SETTLEABLE_PAYMENT_STATUSES` (which excludes `succeeded`). A racing webhook and a confirm poll both attempt the write; only one sees `recorded === true`. The loser returns `{ transitioned: false }` and does no further work.
- **`settleWithin` is deliberately database-only.** The Mongoose session driver re-invokes the transaction callback on a transient network error. Any provider API call, email, or other side effect inside it would fire twice. All external I/O (refund to provider, analytics, audit) happens *after* `.then()` on the committed session.
- **Mismatch recording overwrites the frozen figures.** `settleMismatch` writes `amountReceived` / `currency` from the provider into the payment document (if present) so the subsequent refund returns what was actually collected, not what was originally requested.
- **`orderLost` ≠ `transitioned`.** A late payment can transition the payment to `succeeded` *and* still be lost (order was already shipped/cancelled). The caller must check `orderLost` to refuse the client, regardless of the payment's `displayStatus`.
- **Stryker mutation-test disable blocks** surround the error-path `.catch` handlers in `returnMismatchedMoney` and the mismatch logger call, indicating those paths are intentionally "best-effort" and covered by downstream sweeps rather than direct retry.
