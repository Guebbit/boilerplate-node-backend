---
source: src/modules/payments/services/settlement.ts
source_sha256: 7b961670d201af7e9bc40cfa075f7af168ba784b6b64a85c3c7da875caaf5592
context_sha256: 31c992f52268459a60a792ff92ba1ea76e00135cac0a1eafa15ff3cca55237b4
generated_at: 2026-11-22T06:53:47.727748+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/settlement.ts

## Purpose
Single place where provider-reported payment state is reconciled into money movement. Both the browser-driven confirm/sync path and webhook deliveries funnel into `settlePayment`, so an order is never settled twice by drifted copies of the logic.

## Key elements
- `settlePayment` (referenced in the module doc; its body is not visible in the shown portion): the one reconciliation entry point.
- `Settlement` (interface): result of a settlement, with `payment`, `orderLost` (money arrived when the order could no longer be paid, so the caller owes the client a refusal even if the refund succeeded), and `transitioned` (whether this call's own write moved the payment; racing losers report `false`).
- `receiptMismatch(payment, state)`: returns which of `currency`, `amount`, `paymentId` differ from the provider's `succeeded`. Amounts are compared in minor units via `toMinorUnits`. A field the provider did not report counts as a mismatch.
- `mismatchFigures(state)`: amount and currency to write over the frozen figures. Currency is included only together with an amount.
- `settleMismatch(payment, state, fields)`: handles a provider success that doesn't match the frozen payment.
  - In one transaction it conditionally writes `succeeded` (via `updateStatusIfIn` with `SUCCESS_SETTLEABLE_PAYMENT_STATUSES`), opens a refund (`openRefund` with `CANCELLATION_REQUEST`), enqueues a `PAYMENT_AMOUNT_MISMATCH` outbox event, and calls `orderService.markMoneyReceived`.
  - After commit it nudges the outbox, increments `paymentAmountMismatchTotal` per field, logs an error, records an audit entry, and calls `returnMismatchedMoney`.
  - It returns `orderLost: true`. `transitioned` is `false` if the conditional write lost the race.
- `returnMismatchedMoney(orderId)`: cancels the order (`cancelForPaymentMismatchById`), then `performRefund`. Failures of either step are logged and swallowed. The reservation expiry or `retryOpenRefunds` finishes them.
- `SettlementOutcome` (type): transaction result, one of `replay`, `paid` or `lost` (with an optional `RefundRecord`).
- `PROVIDER_ID_MAX_LENGTH` (64): truncates the provider's payment id in the mismatch event.

## Relationships
- `@modules/orders` (`orderService`, `paymentSettled`), `orders/friends/payments` (`markPaid`): used to cancel orders, mark money received and mark orders paid.
- `@domain-primitives/money`: `toMinorUnits` for amount comparison.
- `@infrastructure/runtime/database`: `withTransaction` wraps the atomic steps.
- `@kernel/outbox`: `enqueueOutboxEvent` and `nudgeOutbox` for transactional events.
- `@kernel/permissions`: `systemCallerContext('Payment')` is the actor for audit entries.
- `@infrastructure/observability/audit` and `.../analytics`: audit records and analytics events.
- `@infrastructure/adapters/logger`: error logging.
- `@infrastructure/http/response` and `@infrastructure/i18n`: imported to build localized HTTP success and reject responses, though their use is not visible in the shown portion.
- Local payments modules: `../repository`, `../providers` and its registry, `../domain` status sets, `../metrics`, `../events`, and the `./refunds`, `./external-refunds`, `./disputes`, `./announce`, `./scope` and `./errors` services.

## Notes
- Mismatch handling is conditional on the payment status, so exactly one of several racing calls reports and cancels. Losers only report that the order is no longer payable.
- In a mismatch, no stock is committed, no `payment.succeeded` is announced and no invoice is issued.
- Transaction callbacks must be database-only (no provider calls or mail), because the driver re-runs them on transient errors.
- Mismatch logs are wrapped in `Stryker disable` comments, which exclude them from mutation testing.
