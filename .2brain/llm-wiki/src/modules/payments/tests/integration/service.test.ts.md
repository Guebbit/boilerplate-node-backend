---
source: src/modules/payments/tests/integration/service.test.ts
sha256: 35e2b300c8059b97d5c0d23e8b82d6b7ff0fa52fc9ea0d608deea0d84ec3a2cf
generated_at: 2026-09-23T19:24:00.723194+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/integration/service.test.ts

## Purpose

Integration test suite for the payments service layer. It pins the invariants of the intent → confirm → (refund) lifecycle against a real Mongo database, using the `fake` payment provider. The guarantees under test are the conditional writes (one payment per order, order-status-conditional confirmation, at-most-once refund) and the stable error codes the public API exposes.

## Key elements

- **`GOOD_METHOD`** – `'pm_card_visa'`, an opaque card-handle string that the fake provider accepts.
- **`FAKE_DECLINE_METHOD`** – imported from `providers/fake`; triggers a simulated card decline.
- **`orderFor(price, quantity)`** – fixture: creates a user, a product, and a pending order with the given line total.
- **`paidOrder()`** – fixture: runs `createIntent` + `confirmPayment(GOOD_METHOD)` to yield a fully paid order.
- **`auth(user)`** – wraps a user id into an `asCustomer` caller context.
- **`describe('createIntent')`** – asserts: amount equals `order.totalPrice` (shipping included); idempotency (one row per order); 404 for non-owners; 409 `PAYMENT_ORDER_NOT_PAYABLE` for non-pending orders; `method` stored as `'card'`.
- **`describe('confirmPayment')`** – asserts: order → `paid` and payment → `succeeded` together; decline is 409 `PAYMENT_DECLINED` and retryable; 404 for non-owners; 409 `PAYMENT_NOT_CONFIRMABLE` on double-confirm; 409 + provider refund when the order is cancelled in the intent→confirm window (status becomes `refunded`, not back to `requires_confirmation`).
- **`describe('getForOrder')`** – (truncated in source) owner-vs-stranger access checks.

## Relationships

- **`@modules/payments/services` (index)** – imports `createIntent`, `confirmPayment`, `syncPayment`, `applyWebhookDelivery`, `applyWebhookSettlement`, `getForOrder`, `refundByOrder`, `recordOfflinePayment`; the code under test.
- **`@modules/payments/providers/fake.ts`** – supplies `fakePaymentProvider` (spied in the refund-on-cancel test) and `FAKE_DECLINE_METHOD`.
- **`@modules/payments/repository.ts`** – `paymentRepository` used to assert persisted state (amount, status, cardLast4, providerRef, method).
- **`@modules/payments/module.ts`** – registered via `registerModules` so the module's listeners (e.g. `ORDER_CANCELLED` refund hook) are active.
- **`@modules/orders/index.ts`** – `orderService` used to read order status and to call `cancelById` in the race-condition test.
- **`@modules/orders/tests/factories.ts`** – `createOrder`, `forceOrderStatus`, `toOrderItem` build the fixture orders.
- **`@kernel/registry.ts`** – `registerModules` wires all domain modules into the test context.
- **`@kernel/events.ts`** – `resetDomainEvents` clears the in-memory event bus between tests.
- **Module registrations** – `inventory`, `products`, `users`, `account`, `cart`, `delivery` modules are registered to satisfy cross-module event listeners and service lookups at runtime.

## Notes

- Tests run against **real Mongo** (`setupTestDb`), not an in-memory mock, because the invariants being pinned are conditional-write guarantees that only a real driver exercises.
- The refund-on-cancel test asserts the refund reference is read from the **persisted row** (`paymentRepository`), not from the API response—deliberately, to prevent a future refactor from leaking `providerRef` in a public payload.
- `confirmPayment` returns the payment id via a nested `data.id` shape; the test casts it (`as { data?: { id?: string } }`) rather than relying on a typed return, which suggests the service API returns a loose envelope.
- The file is truncated in the source snapshot; the `getForOrder` suite and any `syncPayment` / webhook / offline suites are not visible.
