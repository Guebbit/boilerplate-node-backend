---
source: tests/integration/refund-retry-webhooks.test.ts
sha256: b338617626916b599e77c2bb79be7c6bac495865a47b7d3e5178170af7f966d5
generated_at: 2026-09-27T15:57:54.510131+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/refund-retry-webhooks.test.ts

## Purpose

Guarantees that the refund-retry sweep (`orderService.retryPendingEffects`) does **not** re-trigger the `order.cancelled` webhook for every subscriber. It exists at the integration level because the invariant spans three modules (orders, payments, webhooks) whose real `subscribe()` hooks must all be wired simultaneously.

## Key elements

- **`paidOrder()`** — fixture helper that creates a user, a $20 product, an order, and a confirmed card payment via the fake provider. Returns `{ user, order }` for the test body.
- **`retries the owed refund without re-announcing the cancellation, and delivers it once`** — the single test case. Sequence:
  1. Sets `NODE_ORDER_EFFECT_RETRY_MINUTES=0` so the retry sweep runs immediately.
  2. Registers `paymentsModule` and `webhooksModule`; creates a wildcard (`'*'`) webhook subscription.
  3. Calls `paidOrder()`, then spies on `fakePaymentProvider.refund` with `mockRejectedValueOnce` to simulate a provider outage during the initial cancel.
  4. Cancels the order → refund fails → `ORDER_REFUND_OWED` marker is left.
  5. Calls `orderService.retryPendingEffects()` → second (unmocked) refund succeeds; expects return value `1`.
  6. Queries `webhookDeliveryRepository.findAll({ eventType: 'order.cancelled' })` and asserts **exactly one** row.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/events.ts` | `resetDomainEvents()` in `afterEach` clears in-memory event bus state between tests. |
| `src/modules/orders/index.ts` | Provides `orderService` used for `create`, `cancelById`, and `retryPendingEffects`. |
| `src/modules/payments/module.ts` | Registered via `registerCheckoutModules` so its `ORDER_REFUND_OWED` subscriber is active. |
| `src/modules/payments/providers/fake.ts` | `fakePaymentProvider.refund` is spied on (`mockRejectedValueOnce`) to simulate the first refund failure. |
| `src/modules/payments/services/index.ts` | Exports `createIntent` and `confirmPayment` used by the `paidOrder` fixture. |
| `src/modules/products/tests/factories.ts` | `createProduct` builds the line-item product. |
| `src/modules/users/tests/factories.ts` | `createUser` builds the buyer. |
| `src/modules/webhooks/module.ts` | Registered so its `ORDER_CANCELLED` fan-out subscriber is active. |
| `src/modules/webhooks/repository.ts` | `webhookDeliveryRepository.findAll` is the assertion target (delivery-row count). |
| `src/modules/webhooks/services/subscriptions.ts` | `createSubscription` registers the wildcard endpoint under test. |
| `tests/support/callers.ts` | `callerAs`, `asCustomer`, `testCallerContext`, `TEST_TENANT_ID` for tenant-scoped auth. |
| `tests/support/checkout-modules.ts` | `registerCheckoutModules` wires the two modules into the test container. |

## Notes

- **Why integration, not unit:** the invariant depends on the *absence* of a payments→`ORDER_CANCELLED` subscription and the *presence* of a payments→`ORDER_REFUND_OWED` subscription. Neither is visible from a single module's unit tests.
- **`mockRejectedValueOnce` is critical:** only the first refund call is rejected. The retry call hits the real fake provider and succeeds. Using a persistent mock would make the retry fail too, masking the assertion.
- **Environment variable:** `NODE_ORDER_EFFECT_RETRY_MINUTES` is set to `'0'` via `withEnvironment` so the sweep doesn't wait a real timer; the helper restores the prior value on exit.
- The inline comment references **B6**, an internal ticket for the "refund_owed carries no webhook of its own" behaviour — the test encodes that contract.
