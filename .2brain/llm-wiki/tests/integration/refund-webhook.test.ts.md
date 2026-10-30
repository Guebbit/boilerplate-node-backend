---
source: tests/integration/refund-webhook.test.ts
sha256: c51ba9bfb8e4b8b2a691a21c53c1da78b597301ca06a498c1478c9e9eb960189
generated_at: 2026-10-29T07:01:35.673598+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/refund-webhook.test.ts

## Purpose

Integration test that verifies an admin standalone refund (`POST /payments/:id/refunds`) fans out a `payment.refunded` webhook delivery carrying the correct amount and currency. It exercises the real module-registry indirection (payments never imports webhooks directly), proving the wiring end-to-end rather than relying on reading `publicEvents` maps.

## Key elements

- **`paidOrder(price)`** — fixture that creates a user, a product, an order via `orderService.create`, and pays it by card; returns `{ user, order }`.
- **`refundDeliveries()`** — queries `webhookDeliveryRepository.findAll` filtered to `TEST_TENANT_ID` and `eventType: 'payment.refunded'`.
- **`it('an admin refund fans out a payment.refunded delivery …')`** — the single test case. Registers `paymentsModule` + `webhooksModule`, creates a wildcard subscription, pays a 20-unit order, refunds it, then polls for the delivery row and asserts `payload` contains `orderId`, `amount: 20`, and `currency`.
- **`afterEach`** — calls `resetDomainEvents()` to clear the in-memory event bus between tests.

## Relationships

- **`src/kernel/events.ts`** — `resetDomainEvents` is called in `afterEach` to reset the global domain-event registry.
- **`src/modules/orders/index.ts`** — provides `orderService.create` used to build the order fixture.
- **`src/modules/payments/module.ts`** — imported and passed to `registerCheckoutModules` so the registry can resolve its `publicEvents`.
- **`src/modules/payments/tests/factories.ts`** — supplies `payByCard` and `refundOrderPayment` test helpers.
- **`src/modules/products/tests/factories.ts`** — supplies `createProduct`.
- **`src/modules/users/tests/factories.ts`** — supplies `createUser`.
- **`src/modules/webhooks/module.ts`** — imported and registered alongside the payments module; its event-subscription service handles the actual delivery.
- **`src/modules/webhooks/repository.ts`** — `webhookDeliveryRepository` is the assertion target (reads delivery rows).
- **`src/modules/webhooks/services/subscriptions.ts`** — `create` (aliased `createSubscription`) sets up the webhook endpoint that receives the event.
- **`tests/support/callers.ts`** — provides `callerAs`, `asAdmin`, `TEST_TENANT_ID`, `callerContextAs`.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires modules into the runtime registry for the test.
- **`tests/support/eventually.ts`** — `eventually` polls until the async delivery row is written.
- **`tests/support/response.ts`** — `asSuccess` unwraps the `Result` from `orderService.create`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` boots an isolated Mongo instance.

## Notes

- The delivery is **fire-and-forget**: `markRefunded` emits `PAYMENT_REFUNDED` without awaiting the subscriber, so the row appears in Mongo *after* `refundOrderPayment` resolves. The test must poll with `eventually` rather than asserting immediately.
- The wildcard subscription (`eventTypes: ['*']`) is intentional — it mirrors a real merchant endpoint that hasn't filtered events yet, ensuring the test doesn't depend on a specific event-type subscription matching.
- Module registration (`registerCheckoutModules`) is what makes the cross-module event dispatch work; without it the payments module has no path to reach the webhooks subscriber, which is the exact wiring this test guards.
