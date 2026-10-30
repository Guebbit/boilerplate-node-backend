---
source: src/modules/payments/tests/integration/refund-provider-status.test.ts
sha256: 0a419932cb27a9801ba1d111444e1c0ba12597cd027d4532183355c09b60970a
generated_at: 2026-10-29T05:19:27.760207+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/refund-provider-status.test.ts

## Purpose

Integration test verifying the lifecycle of a refund the provider accepts but leaves `pending` (unsettled). It confirms three behaviors: the initial refund call returns 201 with no outbox announcement, the sweep re-reads (never re-sends) the refund and settles it only when the provider confirms, and a webhook settling the refund is idempotent across redeliveries. Uses real Mongo with the fake provider's `pending` lever.

## Key elements

- **`pendingRefund()`** – End-to-end helper: creates a user, product, order, processes a card payment, then triggers a 30.00 refund with the fake provider forced into `pending`. Returns the orderId, providerRef, HTTP answer, payment doc, refundId, and refundRef.
- **`refundedEvents()`** – Counts `payment.refunded` documents in the outbox collection.
- **"answers 201 … and announces nothing"** – Asserts the refund record is `pending` with no `settledAt`, and the outbox holds zero `PAYMENT_REFUNDED` rows after nudging.
- **"is re-read by the sweep … and settles once the provider says so"** – Spies on `fakePaymentProvider.refund` / `.retrieveRefund`; verifies the sweep calls only `retrieveRefund`, flips the provider outcome to `succeeded`, confirms the sweep settles the record and emits exactly one outbox event.
- **"is settled by a webhook … and a redelivery changes nothing"** – Delivers the same webhook event twice; asserts the refund is `succeeded` and the outbox still holds exactly one event.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – Source of `fakePaymentProvider` (spied on), `refundRefOfRecord`, `setFakeRefundPending`, and `setFakeRefundOutcome`.
- **`src/modules/payments/services/index.ts`** – `paymentService.retryOpenRefunds()` (sweep) and `paymentService.applyWebhookDelivery()` (webhook path) are the units under test.
- **`src/modules/payments/repository.ts`** – `paymentRepository.findByOrderId` reads final payment/refund state for assertions.
- **`src/modules/payments/events.ts`** – `PAYMENT_REFUNDED` name used to filter outbox rows.
- **`src/modules/payments/module.ts`** – Registered via `registerCheckoutModules` in `beforeEach`.
- **`src/kernel/outbox.ts`** – `outboxEventModel` (count assertions) and `settleOutboxNudges` (flush pending sends before asserting counts).
- **`src/kernel/events.ts`** – `resetDomainEvents` in `afterEach`.
- **`src/modules/payments/tests/factories.ts`** – `payByCard`, `refundOrderPayment` drive the happy-path setup.
- **`src/modules/orders/tests/factories.ts`**, **`src/modules/products/tests/factories.ts`**, **`src/modules/users/tests/factories.ts`** – Seed the order, product, and user.
- **`tests/support/checkout-modules.ts`**, **`tests/support/callers.ts`**, **`tests/support/environment.ts`**, **`tests/support/setup-test-db.ts`** – Test harness: module registration, caller context, env-var override for retry interval, and real-Mongo bootstrap.

## Notes

- `NODE_PAYMENT_REFUND_RETRY_MINUTES` is overridden to `'0'` so the sweep's time-gate is bypassed; without this the sweep would skip the refund and the test would hang or pass vacuously.
- The sweep test spies on **both** `refund` and `retrieveRefund` to assert the sweep *reads* but never *re-sends*—this is the core idempotency guarantee the fake provider's `pending` lever exercises.
- Webhook idempotency is verified by calling `applyWebhookDelivery` twice with identical `id`/`providerRef`/`refundRef` and asserting only one outbox event exists.
