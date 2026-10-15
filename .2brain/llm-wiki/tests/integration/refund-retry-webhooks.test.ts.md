---
source: tests/integration/refund-retry-webhooks.test.ts
sha256: d6b8d172ebb08c8a58e5b933165f66452a31cd70352aa9d149d8e4800e803012
generated_at: 2026-10-15T12:51:46.640512+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/refund-retry-webhooks.test.ts

## Purpose

Integration test verifying that retrying a stuck (previously failed) refund does **not** re-deliver the `order.cancelled` webhook to subscribers. Because `payments` subscribes to its own `ORDER_REFUND_OWED` event rather than the `ORDER_CANCELLED` event that `webhooks` fans out on, the retry path must not create a second delivery row. The test exercises the real `subscribe()` hooks of orders, payments, and webhooks together, which is why it lives in `tests/integration/` rather than any single module's own `tests/`.

## Key elements

- **`paidOrder()`** – Local fixture that creates a user, product, order, and a confirmed card payment, then calls `settleOutboxNudges()` so the settlement relay rows are published before the cancel arrives (mimicking the real one-request-later gap).
- **The single `it(...)` block** – Registers `paymentsModule` and `webhooksModule`, creates a wildcard webhook subscription, mocks `fakePaymentProvider.refund` to fail once, cancels the order, calls `orderService.retryPendingEffects()`, and asserts exactly **one** `order.cancelled` delivery row exists.
- **`afterEach`** – Resets domain events (`resetDomainEvents`) and restores all Jest spies.

## Relationships

- **`scenarios/support/doubles/payments/fake.ts`** – Provides `fakePaymentProvider`; the test spies on its `refund` method to simulate a one-time provider outage.
- **`src/kernel/events.ts`** – `resetDomainEvents()` is called in `afterEach` to clear the in-memory event bus between tests.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges()` is awaited after `confirmPayment` to flush settlement relay rows before the cancel.
- **`src/modules/orders/index.ts`** – `orderService` is used for `create`, `cancelById`, and `retryPendingEffects`.
- **`src/modules/payments/module.ts`** – `paymentsModule` is registered via `registerCheckoutModules` so its `subscribe()` hooks are active.
- **`src/modules/payments/services/index.ts`** – Exports `createIntent` and `confirmPayment`, used in the `paidOrder` fixture.
- **`src/modules/products/tests/factories.ts`** – `createProduct` creates the fixture product.
- **`src/modules/users/tests/factories.ts`** – `createUser` creates the fixture customer.
- **`src/modules/webhooks/module.ts`** – `webhooksModule` is registered so its event-fan-out subscriber is live.
- **`src/modules/webhooks/repository.ts`** – `webhookDeliveryRepository.findAll` is used for the final delivery-count assertion.
- **`src/modules/webhooks/services/subscriptions.ts`** – `createSubscription` sets up the wildcard (`*`) webhook endpoint.
- **`tests/support/callers.ts`** – Provides `callerAs`, `testCallerContext`, `asCustomer`, `TEST_TENANT_ID`, and `callerContextAs` for authentication context.

## Notes

- **Cross-module placement:** The file intentionally lives in `tests/integration/` because the invariant spans three modules' real subscriber registrations; it cannot be meaningfully scoped to one module's unit tests.
- **Environment override:** `withEnvironment('NODE_ORDER_EFFECT_RETRY_MINUTES', '0', …)` zeroes out the retry delay so `retryPendingEffects()` acts immediately within the test.
- **Single-failure mock:** `mockRejectedValueOnce` ensures the *second* (retry) call hits the real (unmocked) provider, proving the success path works without permanently breaking the fake.
- **Timing assumption:** `settleOutboxNudges()` is a deliberate stand-in for the real "one request later" gap between payment confirmation and cancellation; omitting it would race the relay and make the test flaky.
