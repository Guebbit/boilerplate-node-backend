---
source: src/modules/payments/tests/integration/cancel-redelivery.test.ts
sha256: 511537ea356805ddd3c4cf21f43ea7396260067071ad8ceff1a937d739b71a72
generated_at: 2026-11-14T21:12:17.651844+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/cancel-redelivery.test.ts

## Purpose

Integration tests proving that a redelivered `ORDER_CANCELED` event never produces a second refund. The outbox re-delivers an event until its listener succeeds, and staff may void the first refund in between; the payment must deduplicate by the outbox `eventId` (stored in `handledCancelEvents`), not by the refund record's existence. Tests drive the real listener via `emitDomainEvent` with an explicit `eventId`, real Mongo, and the fake payment provider.

## Key elements

- **`freshOrder`** – creates a 100.00 order (2 × 50.00) with user, product, and order.
- **`paidCardOrder`** – `freshOrder` + `payByCard` + `settleOutboxNudges`; returns `{ user, orderId }`.
- **`cashOrder`** – `freshOrder` + `recordOfflinePayment` (cash); returns `orderId`.
- **`paymentOf(orderId)`** – loads the stored payment via `paymentRepository.findByOrderId`; throws if absent.
- **`field(orderId, key)`** – reads a single typed field (`amountRefunded`, `refunds`, `handledCancelEvents`, `status`) from the stored payment.
- **`deliverCancel(orderId, eventId)`** – emits `ORDER_CANCELED` with `refund: true, cause: 'operator'` and the given `eventId` (the outbox row id).
- **`voidRefund(orderId, index?)`** – staff cancels the refund via `paymentService.cancelRefund`; asserts success.
- **Describe: "a redelivered cancel event after staff voided the refund"** – four tests covering card (provider called once), cash (one owed-by-hand event), a *different* `eventId` legitimately refunds, and emit-without-`eventId` falling back to legacy (no dedup).
- **Describe: "a cancel event that found nothing to return"** – two tests: fully-refunded-then-voided card order, and a not-yet-succeeded intent whose settlement arrives after the cancel; both verify the event is still marked handled and a replay pays nothing.
- **Describe: "a cancel event that fails or races itself"** – four tests (last truncated): write-throw leaves no mark so next delivery succeeds; `markCancelEventHandled` failure still stamped by the write that opens the refund; persistent write failure bounded by `CANCEL_EVENT_WRITE_RETRIES + 1` attempts; two concurrent deliveries open exactly one refund.

## Relationships

- **`src/kernel/events.ts`** – `emitDomainEvent` is the entry point that triggers the listener under test; `resetDomainEvents` clears state in `afterEach`.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes pending outbox work before assertions; `outboxEventModel` is queried to count `PAYMENT_REFUND_OWED_BY_HAND` rows.
- **`src/modules/orders/index.ts`** – exports `ORDER_CANCELED` (event name) and `orderService` (used for `cancelOnRequestById` in the late-settlement test).
- **`src/modules/orders/services/index.ts`** – provides the order service implementation that emits the cancel event.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` for order fixtures.
- **`src/modules/payments/services/index.ts`** – `paymentService` used for `recordOfflinePayment`, `cancelRefund`, `createIntent`, and `applyWebhookSettlement`.
- **`src/modules/payments/services/refunds.ts`** – exports `CANCEL_EVENT_WRITE_RETRIES`, the retry bound asserted in the persistent-write-failure test.
- **`src/modules/payments/repository.ts`** – `paymentRepository` is the read path (`findByOrderId`) and is spied on for `addRefund`/`markCancelEventHandled` injection in failure tests.
- **`src/modules/payments/events.ts`** – `PAYMENT_REFUND_OWED_BY_HAND` event name for outbox row assertions.
- **`src/modules/payments/module.ts`** – `paymentsModule` registered via `registerCheckoutModules` in `beforeEach`.
- **`src/modules/payments/tests/factories.ts`** – `payByCard`, `refundOrderPayment` helpers for setup.
- **`scenarios/support/doubles/payments/fake.ts`** – `fakePaymentProvider` (spied on for `refund` call counts) and `setFakeRefundFailure` to simulate provider rejections.
- **`src/modules/users/tests/factories.ts`** – `createUser` entity helper.
- **`src/modules/products/tests/factories.ts`** – `createProduct` entity helper.
- **`tests/support/callers.ts`** – `asAdmin`, `asCustomer`, `callerContextAs` for RBAC-aware service calls.

## Notes

- Idempotency is keyed on the outbox **`eventId`** string, not on refund-record existence. A `deliverCancel` without an `eventId` (legacy emit) must still work but records nothing in `handledCancelEvents`.
- The test uses `withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' })` to eliminate wall-clock wait in retry-sensitive tests.
- `deliverCancel` returns the listener's boolean result (`true` = handled, `false` = failed); tests assert both outcomes to verify the outbox will or won't redeliver.
- The concurrent-delivery test (truncated in the source) uses `Promise.all` to fire two identical deliveries simultaneously, asserting exactly one refund record and no hang.
- `settleOutboxNudges()` is called after emissions to let the outbox process queued events before assertions run.
