---
source: src/modules/payments/tests/integration/service.test.ts
sha256: c2bcb38c12ec262ad245251f04d16243f73a1bcb5685a8525cab790de3930e23
generated_at: 2026-10-15T11:36:06.547504+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/service.test.ts

## Purpose

Integration test suite that pins the core invariants of the payments service: an intent freezes the order's published total (shipping included), a confirm moves the order `pending → paid` and the payment to `succeeded` atomically, a decline is retryable, and refunds are at-most-once. The suite runs against real Mongo because the conditional writes *are* the guarantees under test; only the payment provider is faked.

## Key elements

- **`orderFor(price?, quantity?)`** — Fixture returning a user, product, and pending order; the starting point for most tests.
- **`paidOrder()`** — Fixture that goes further: creates the intent *and* confirms it with a good card, yielding a fully paid order.
- **`auth(user)`** — Wraps a user id as a customer-scoped caller context for service calls.
- **`GOOD_METHOD` / `FAKE_DECLINE_METHOD`** — Opaque provider method handles (from the fake) for simulating success and decline.
- **`describe('createIntent', …)`** — Pins: total freezes from `totalPrice` (not line-item sum), idempotency (one payment row per order), 404-for-stranger, 409-for-non-pending, and `method: 'card'` vocabulary.
- **`describe('confirmPayment', …)`** — Pins: order→paid / payment→succeeded ordering, card overwrites `bank_transfer` on the order, decline is retryable (same doc confirms next), double-confirm rejected, confirm-after-cancel refused before the provider is ever called.
- **`resetDomainEvents` / `settleOutboxNudges`** — Kernel cleanup called between tests to isolate event/outbox state.
- **`registerCheckoutModules`** — Registers the real payments, orders, inventory, and access modules so the module graph is exercised as in production.

## Relationships

- **`src/modules/payments/services/index.ts`** (SUT) — Imports `createIntent`, `confirmPayment`, `syncPayment`, `applyWebhookDelivery`, `applyWebhookSettlement`, `getForOrder`, `withActions`, `refundByOrder`, `recordOfflinePayment`, `retryOpenRefunds`.
- **`scenarios/support/doubles/payments/fake.ts`** — Provides `fakePaymentProvider`, `FAKE_DECLINE_METHOD`, `setFakeOutcome` to simulate provider outcomes without a real gateway.
- **`src/modules/orders/index.ts`** — `orderService` used to assert post-conditions on order status and to cancel orders mid-flow.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `forceOrderStatus`, `toOrderItem` for order fixture setup.
- **`src/modules/payments/repository.ts`** — `paymentRepository` used for direct DB assertions (amount, status, method, cardLast4, count).
- **`src/modules/payments/module.ts`** — `paymentsModule` registered via `registerCheckoutModules` to wire the real module graph.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the in-process event bus between tests.
- **`src/kernel/outbox.ts`** — `outboxEventModel` and `settleOutboxNudges` manage outbox rows in the test DB.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` for tenant-scoped assertions.
- **`src/modules/access/index.ts`** — `assignRole` for RBAC guard tests.
- **`src/modules/inventory/index.ts`** — `inventoryService` registered so the checkout module graph is complete.

## Notes

- **Real Mongo, fake provider.** The suite deliberately uses a real database because the invariants it pins (conditional writes, at-most-once refunds) only hold under real concurrency/atomicity. The *only* mock is the payment provider.
- **Assertions anchor to `totalPrice`, not literals.** The shipping-inclusion test compares `payment.amount` to `order.totalPrice` (the value `openapi.yaml` publishes) rather than to a hardcoded number, guarding against the two files drifting apart again.
- **404, not 403, for cross-tenant/cross-user access.** The "stranger" tests assert absence (404) as the stable contract, not a forbidden (403).
- **`GOOD_METHOD` is an opaque handle** (`pm_card_visa`), not a card number; the fake maps it to a deterministic success with `cardLast4: '4242'`.
- **Decline ≠ terminal.** After a `PAYMENT_DECLINED` 409, the *same* payment document can be confirmed with a different method — the test asserts this round-trip explicitly.
- **Confirm-after-cancel (A1) is refused before the provider is called.** The test spies on the provider to prove no charge attempt is made, protecting against fee-loss on a post-charge refund.
