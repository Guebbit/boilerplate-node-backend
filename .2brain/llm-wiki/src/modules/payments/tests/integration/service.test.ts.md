---
source: src/modules/payments/tests/integration/service.test.ts
sha256: 6b9e680951789705be2c9bc6d4ca430b92c8254387f08b46efebc07df8819ecd
generated_at: 2026-09-27T15:29:01.873440+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/service.test.ts

## Purpose

Integration tests that pin the core invariants of the payments service: an intent freezes the order's published total (shipping included), a confirm transitions the order `pending → paid` before the payment row is marked `succeeded`, a decline leaves the payment retryable, and a refund is at-most-once. The tests run against a real MongoDB instance and the project's `fake` payment provider (not a mock), because the guarantees under test are the conditional database writes themselves.

## Key elements

- **`orderFor(price?, quantity?)`** — Fixture returning a paying customer with a two-line order; the starting point for most tests.
- **`paidOrder()`** — Fixture that runs `createIntent` + `confirmPayment` with `GOOD_METHOD` so subsequent tests begin from a settled state.
- **`auth(user)`** — Shorthand wrapping a user as an `asCustomer` caller context.
- **`GOOD_METHOD` / `FAKE_DECLINE_METHOD`** — Opaque card handles for the fake provider's success and decline paths.
- **`describe('createIntent', …)`** — Verifies total-freezing (including a shipping-inclusion regression), idempotency (one payment row per order), 404 for non-owners, 409 + `PAYMENT_ORDER_NOT_PAYABLE` for non-pending orders, and `method: 'card'` vocabulary.
- **`describe('confirmPayment', …)`** — Verifies order→paid / payment→succeeded ordering, decline is retryable with a better card, 404 for strangers, 409 + `PAYMENT_NOT_CONFIRMABLE` on double-confirm, 409 on re-intent after payment, and (A1) refusal *before* the provider is ever called when the order was cancelled in the window (spies on `fakePaymentProvider.confirm/refund` to prove neither was invoked).
- **`describe('getForOrder', …)`** — Verifies caller-scoped lookup (owner sees payment, stranger gets 404) and moderator-permission visibility.
- **Additional service functions under test** (imported, exercised in truncated portions): `syncPayment`, `applyWebhookDelivery`, `applyWebhookSettlement`, `refundByOrder`, `recordOfflinePayment`, `retryPendingEffects`.

## Relationships

- **`@modules/payments/services`** (barrel → `intent`, `offline`, `refunds`, `settlement`, `effects`) — The unit under test; every `describe` block exercises one or more of these exports.
- **`@modules/payments/repository`** — `paymentRepository.findByOrderId` / `.count` used to assert database state after each operation.
- **`@modules/payments/providers/fake`** — `fakePaymentProvider` is the real provider instance the service calls; `FAKE_DECLINE_METHOD` triggers the decline path; spied on in the cancelled-order test to assert no provider call occurs.
- **`@modules/payments/module`** — Imported for module-level wiring (likely event-listener registration such as the `ORDER_REFUND_OWED` listener).
- **`@modules/orders`** (→ `orderService`) — `getById` to verify order status transitions; `cancelById` in the A1 cancelled-order scenario.
- **`@modules/orders/tests/factories`** — `createOrder`, `forceOrderStatus`, `toOrderItem` build and manipulate the order fixture.
- **`@modules/inventory`** (→ `inventoryService`) — Imported for inventory-state assertions (likely in the truncated refund/settlement sections).
- **`@kernel/events`** — `resetDomainEvents` clears the in-memory event bus between tests so listeners (e.g. `ORDER_REFUND_OWED`) don't fire twice.
- **`@tests/setup-test-db`**, **`@tests/environment`**, **`@tests/callers`**, **`@tests/response`**, **`@tests/checkout-modules`** — Shared test infrastructure: real Mongo lifecycle, env vars, caller-context builders, rejection assertion helper, and multi-module registration.

## Notes

- **Real database, not mocks.** `setupTestDb()` spins up a real MongoDB; the tests assert on conditional-write guarantees (e.g. "payment row only says `succeeded` when the order does"), which cannot be verified against a mock.
- **Fake provider ≠ mock.** `fakePaymentProvider` is the project's committed fake implementation; the A1 test still `jest.spyOn`s it to prove the service short-circuits *before* the provider is reached.
- **`asReject` pattern.** All negative assertions go through `asReject(result)` from `@tests/response`, which unwraps the standard error envelope (`status`, `errors[].code`).
- **Shipping-inclusion regression.** The "charges the total the order publishes" test exists specifically to catch a historical bug where the intent summed line items in isolation, silently dropping `shippingCost` on every non-free order.
- **File is truncated.** The visible content covers `createIntent`, `confirmPayment`, and the start of `getForOrder`. The imports (`refundByOrder`, `applyWebhookSettlement`, `recordOfflinePayment`, `retryPendingEffects`, `syncPayment`) indicate additional `describe` blocks for refunds, webhooks, offline, and effects exist further down.
