---
source: src/modules/payments/services/settlement.ts
sha256: 83851c88dae44a93419338deda4e58bd79c1393fc81698771c3b69e0898c889e
generated_at: 2026-11-08T07:29:42.906382+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/settlement.ts

## Purpose

The single reconciliation point for all payment settlement. Whether the signal arrives via a browser-driven confirm/sync poll or a provider webhook, both paths funnel into this module so that money is settled exactly once. It detects provider-reported mismatches, performs the atomic `succeeded` write plus order state transition, and opens the refund path when the order can no longer accept the payment.

## Key elements

- **`Settlement`** (interface) — Result shape returned to HTTP callers: the current `payment`, an `orderLost` flag (money arrived too late), and `transitioned` (did *this* call win the race).
- **`receiptMismatch`** — Compares provider-reported `currency`, `amountReceived`, and `paymentId` against the frozen payment fields using `toMinorUnits`. Returns an array of mismatching field names; empty means match.
- **`settleMismatch`** — Handles a provider "succeeded" that doesn't match the frozen payment. Records what actually arrived, opens a refund, enqueues a `PAYMENT_AMOUNT_MISMATCH` outbox event, marks money received on the order, then fires `returnMismatchedMoney`.
- **`returnMismatchedMoney`** — Cancels the order via `orderService.cancelForPaymentMismatchById` and performs the refund. Both steps are best-effort; failures are logged and deferred to reservation expiry or the refund retry sweep.
- **`SettlementOutcome`** (type) — Discriminated union the atomic transaction resolves to: `replay` (another call won), `paid` (order moved), or `lost` (order gone; refund opened).
- **`settleWithin`** — The single `withTransaction` callback that atomically writes `succeeded` on the payment and calls `orderService.markPaid` (committing the stock hold). Database-only; no provider calls or mail inside the transaction.
- **`settlePayment`** *(truncated in source, referenced by module docstring)* — The public entry point that dispatches to `settleMismatch` or `settleWithin` and shapes the final `Settlement` response.

## Relationships

- **`@domain-primitives/money`** — `toMinorUnits` converts amounts to integer minor units before comparison, avoiding float drift.
- **`@infrastructure/adapters/logger`** — Error-level logs for mismatch detection and refund/cancel failures.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` build the HTTP envelope from the `Settlement` result.
- **`@infrastructure/i18n`** — `t` for user-facing message strings.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` / `buildAnalyticsBase` fire analytics on settlement outcomes.
- **`@infrastructure/observability/audit`** — `recordAudit` writes an audit entry for amount mismatches.
- **`@infrastructure/runtime/database`** — `withTransaction` wraps the payment + order writes so they commit atomically.
- **`@kernel/outbox`** — `enqueueOutboxEvent` persists domain events (e.g. `PAYMENT_AMOUNT_MISMATCH`) in-transaction; `nudgeOutbox` triggers dispatch after commit.
- **`@kernel/permissions`** — `systemCallerContext` supplies the caller identity for audit records.
- **`@modules/orders`** — `orderService` provides `markPaid`, `cancelForPaymentMismatchById`, and `markMoneyReceived`; `paymentSettled` is a domain event helper.
- **`@modules/payments/analytics`** — `paymentsAnalyticsEvents` defines the event names emitted here.

## Notes

- **Exactly-once guarantee:** The payment write uses `updateStatusIfIn` gated on `SUCCESS_SETTLEABLE_PAYMENT_STATUSES` (which excludes `succeeded`). A racing webhook and confirm poll both call in, but only one sees its write land; the other gets `{ kind: 'replay' }` and reports `transitioned: false`.
- **Money never durable without a return path:** In both the mismatch and lost-order branches, the refund record (`openRefund`) is opened *inside the same transaction* as the `succeeded` write. A provider-call failure after commit is handled by the refund retry sweep, not by re-entering the transaction.
- **`transitioned` vs. status:** The payment's `displayStatus` may read `refunded` or `succeeded` even when `orderLost` is `true`. Callers must check `orderLost` to decide whether to respond with a rejection, because the status alone does not convey that the order was lost.
- **Stryker suppressions:** Intentional around `logger.error` calls in catch chains to keep mutation coverage honest while acknowledging those paths are defensive.
- **`extra` spread in `updateStatusIfIn`:** Only fields the provider actually reported are written (`amountReceived`, `currency`, `cardLast4`); absent fields are omitted so the frozen values are not clobbered with `undefined`.
