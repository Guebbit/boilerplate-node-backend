---
source: src/modules/payments/tests/integration/canceled.test.ts
sha256: 95c4b103047dccf51407852ccc24f9ef001e5570d436e340518a8d1503c8ad21
generated_at: 2026-11-14T21:13:01.226467+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/canceled.test.ts

## Purpose

Integration tests for the `canceled` payment state. Verifies that canceling an order transitions the payment to `canceled` (or leaves it untouched if the provider refuses), that late provider reports on a canceled payment are handled correctly (ignored, refunded-if-money-landed, idempotent on redelivery, skipped by reconciliation), and that the retention reaper deletes old canceled payments while preserving succeeded ones.

## Key elements

- **`canceledOrder()`** — shared fixture: creates a user, product, order, and a payment intent via `paymentService.createIntent`, then cancels the order through the order service and flushes the outbox. Returns `{ user, orderId, providerRef }`.
- **`statusOf` / `refundCountOf` / `providerRefOf` / `orderStatusOf`** — tiny read helpers that pull a single field from the payment or order for assertions.
- **`describe('cancelling an order with an open intent')`** — three cases: provider confirms close → status `canceled`; payment never reached provider → still `canceled`; provider rejects cancel → status unchanged (`requires_confirmation`).
- **`describe('a late report on a canceled payment')`** — covers webhook settlement for `processing`/`declined` (no state change, no `PAYMENT_FAILED` event), buyer sync (does not call `retrieve`), a late success (records refund, display status `refunded`), idempotent redelivery, and the reconciliation sweep skipping canceled payments.
- **`describe('the retention reaper')`** — calls the repository's deletion method and asserts the canceled payment is removed while a succeeded one survives.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** — the fake PSP; all provider-side state (confirm, decline, cancel-rejection, late outcomes) is driven through this file's exports.
- **`src/kernel/events.ts`** — provides the domain-event reset used in `afterEach` to prevent cross-test leakage.
- **`src/kernel/outbox.ts`** — the asynchronous event-delivery mechanism; tests must flush it after an order cancel before asserting on the payment, and also use it to confirm no unwanted events were emitted.
- **`src/modules/orders/index.ts`** — exports the order service used to cancel orders and read back order status.
- **`src/modules/orders/services/index.ts`** — the orders service layer underlying the order module; the cancel entry point lives here.
- **`src/modules/orders/tests/factories.ts`** — `createOrder` and `toOrderItem` build the order fixture.
- **`src/modules/payments/events.ts`** — provides the `PAYMENT_FAILED` event name used in outbox count assertions.
- **`src/modules/payments/model.ts`** — the payment aggregate; used for direct document creation (the "never reached provider" case) and existence checks in the reaper test.
- **`src/modules/payments/module.ts`** — registered via `registerCheckoutModules` in `beforeEach` to wire listeners.
- **`src/modules/payments/presenter.ts`** — transforms the stored payment into buyer-facing display status.
- **`src/modules/payments/repository.ts`** — read access for assertions and the `deleteAbandonedBefore` operation used by the reaper test.
- **`src/modules/payments/services/index.ts`** — the payment service under test (intent creation, webhook settlement, buyer sync, reconciliation).
- **`src/modules/products/tests/factories.ts`** — `createProduct` fixture.
- **`src/modules/users/tests/factories.ts`** — `createUser` fixture.
- **`tests/support/callers.ts`** — `asCustomer` and `testCallerContext` supply caller identity for service calls.

## Notes

- The cancel → payment-listener path is **asynchronous via the outbox**; every test that cancels an order must flush the outbox before asserting on the payment. Forgetting this is the most common source of false-green tests here.
- The `retrieve` spy in the "buyer sync" test is installed **after** `canceledOrder()` returns deliberately — the cancel flow itself may call `retrieve`, so an earlier spy would produce a false positive.
- `setFakeOutcome` (from the fake PSP) simulates a provider-side state change that the application learns about only through the webhook settlement entry point; it is not an application-level call.
- The reconciliation-sweep test sets `NODE_PAYMENT_RECONCILE_MINUTES` to `'0'` via `withEnvironmentOverrides` so that any payment older than the threshold is eligible for processing.
