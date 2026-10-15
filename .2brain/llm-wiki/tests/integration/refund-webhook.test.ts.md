---
source: tests/integration/refund-webhook.test.ts
sha256: fee591d35cb48e427ad8354e9432fc71ba8f6dc6567937727ffcd45cc6a6f164
generated_at: 2026-10-15T12:52:01.034194+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/refund-webhook.test.ts

## Purpose

Integration test proving that an admin standalone refund (`refundByOrder`) fans out a `payment.refunded` webhook delivery carrying the correct amount and currency. Because the `payments` module never imports `webhooks` directly, this test exercises the real module-registry indirection to verify the wiring end-to-end rather than relying on reading the `publicEvents` map.

## Key elements

- **`setupTestDb()` / `afterEach(resetDomainEvents)`** — boots a test database and clears the in-memory domain-event queue between tests.
- **`paidOrder(price)`** — fixture helper: creates a user, a product at the given price, an order, a Stripe-style payment intent, and confirms payment. Returns `{ user, order }`.
- **`waitForDelivery(orderId, timeoutMs?)`** — polls `webhookDeliveryRepository.findAll` every 10 ms (default timeout 2 000 ms) until a `payment.refunded` delivery document for the tenant appears, or throws.
- **The single `it` block** — registers `paymentsModule` and `webhooksModule`, creates a wildcard webhook subscription, pays an order for 20, calls `refundByOrder`, then asserts the delivery payload contains the order id, amount (20), and currency.

## Relationships

- **`src/kernel/events.ts`** — `resetDomainEvents` clears the shared event bus in `afterEach`.
- **`src/modules/payments/module.ts`** — `paymentsModule` is registered in the module registry so its `publicEvents` map is active.
- **`src/modules/payments/services/index.ts`** — exports `createIntent`, `confirmPayment`, `refundByOrder` used by the fixture and test body.
- **`src/modules/webhooks/module.ts`** — `webhooksModule` is registered alongside `paymentsModule` to activate the webhook fan-out handler.
- **`src/modules/webhooks/services/subscriptions.ts`** — `createSubscription` sets up the receiver endpoint (`eventTypes: ['*']`).
- **`src/modules/webhooks/repository.ts`** — `webhookDeliveryRepository.findAll` is the polling target in `waitForDelivery`.
- **`src/modules/webhooks/model.ts`** — `WebhookDeliveryDocument` type shapes the polled result.
- **`src/modules/orders/index.ts`** — `orderService.create` builds the order that is later refunded.
- **`src/modules/products/tests/factories.ts`** / **`src/modules/users/tests/factories.ts`** — `createProduct` / `createUser` seed the fixture.
- **`src/infrastructure/persistence/create-repository.ts`** — provides the `Lean` type used in `waitForDelivery`'s return signature.

## Notes

- The refund event is emitted fire-and-forget (`void emitDomainEvent(...)`), so the delivery row is **not** guaranteed to exist when `refundByOrder` resolves. The 10 ms polling loop (mirroring `settlement-email.test.ts`'s `waitUntil`) is required because the fan-out involves two sequential Mongo round-trips (`findEnabled` → `create`), not a single microtask.
- The subscription uses `eventTypes: ['*']` rather than explicitly listing `payment.refunded`; the test relies on the wildcard match.
- Fixture shape intentionally mirrors `./refund-retry-webhooks.test.ts` so the two suites can be read side-by-side.
