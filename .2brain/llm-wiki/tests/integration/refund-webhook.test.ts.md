---
source: tests/integration/refund-webhook.test.ts
sha256: a92b8998928e20b56bdabc1fc2aa094e20511ba48a4a6fe879ae6092ae382b79
generated_at: 2026-11-08T09:46:25.019536+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/refund-webhook.test.ts

## Purpose

Integration test that verifies a standalone admin refund (`POST /payments/:id/refunds`) fans out a `payment.refunded` webhook delivery carrying the correct amount and currency. Because the `payments` module never imports `webhooks` directly, this test is the only way to prove the registry wiring end-to-end rather than by reading the `publicEvents` map in `module.ts`.

## Key elements

- **`paidOrder(price)`** — Local helper: creates a user, a product at the given price, an order via `orderService.create`, and pays by card. Returns the user and the paid order.
- **`refundDeliveries()`** — Local helper: queries `webhookDeliveryRepository.findAll` for `payment.refunded` events on the test tenant.
- **Single `it` block** — Registers the payments + webhooks modules, subscribes a `*` webhook, triggers a refund, then asserts the delivery payload contains the correct `orderId`, `amount` (`'20.00'`), and `currency`.
- **`afterEach`** — Calls `resetDomainEvents()` to clear the in-memory event bus between tests.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises a real MongoDB instance for the suite.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires the payments and webhooks modules into the module registry so the event-dispatch indirection is exercised.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears queued domain events after each test.
- **`tests/support/callers.ts`** — Provides `callerAs`, `asAdmin`, `TEST_TENANT_ID`, and `callerContextAs` for tenant-scoped RBAC context.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds the purchaser.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds the purchasable item.
- **`src/modules/orders/index.ts`** — Re-exports `orderService` (defined in `src/modules/orders/services/index.ts`) used to create and pay the order.
- **`src/modules/payments/module.ts`** — The payments module under test; its `publicEvents` map is the wiring this test validates.
- **`src/modules/payments/tests/factories.ts`** — `payByCard` and `refundOrderPayment` drive the payment lifecycle.
- **`src/modules/webhooks/module.ts`** — The webhooks module registered alongside payments so the delivery pipeline is live.
- **`src/modules/webhooks/services/subscriptions.ts`** — `create` registers the test webhook subscription (`https://example.com/hook`, all events).
- **`src/modules/webhooks/repository.ts`** — `webhookDeliveryRepository` is queried to assert the delivery row exists with the expected payload.
- **`tests/support/eventually.ts`** — `eventually` polls until the async delivery row is written.
- **`tests/support/response.ts`** — `asSuccess` unwraps the `Result` from `orderService.create`.

## Notes

- **Fire-and-forget timing:** `markRefunded` emits `PAYMENT_REFUNDED` asynchronously; the delivery row appears *after* `refundPayment` has already resolved (two Mongo round-trips: `findEnabled` → `create`). This is why `eventually` is required instead of a plain `await`.
- **Paired test:** The module docblock references `./refund-retry-webhooks.test.ts` as the same-shape sibling (retry path vs. initial delivery). Keep fixture helpers in sync when updating one.
- **No `payments → webhooks` import:** The entire point of the test is that this coupling exists only in the registry; do not "simplify" the test by mocking the webhook module, as that would defeat the purpose.
