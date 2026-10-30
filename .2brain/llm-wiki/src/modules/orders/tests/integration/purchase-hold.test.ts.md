---
source: src/modules/orders/tests/integration/purchase-hold.test.ts
sha256: b5d88c9cce388a33174711b3ee6c7155187d19f894fd619624194b29518d8485
generated_at: 2026-10-29T04:55:34.285601+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/purchase-hold.test.ts

## Purpose

Integration tests for the **purchase-hold** behavior: after a buyer's repeated cancellations (or reservation expiries / withdrawals), the shop pauses that buyer's checkout. Verifies the hold is placed exactly once, staff are notified once, only the buyer's own cancellations count, and a staff lift resets the counter.

## Key elements

- **`cancelOneAsBuyer`** — creates a pending order and cancels it as the buyer; returns the order id.
- **`cancelOnePaidAsBuyer`** — same but on a PAID order (statutory withdrawal with refund).
- **`withdrawOneUnpaid`** — creates an unpaid order and withdraws it via returns before dispatch.
- **`letOneExpire`** — creates an unpaid order and lets the checkout reservation time out.
- **`flaggedAt(userId)`** — reads `purchaseHoldFlaggedAt` from the user repository to assert the review flag.
- **`buyerCancelled(orderId)`** — builds the `ORDER_CANCELLED` event payload (`cause: 'customer'`).
- **`placedFacts`** / **`staffNotices()`** — accumulate `ORDER_PURCHASE_HOLD_PLACED` domain events emitted during the test; used to assert notification count and shape.
- **`holdOf(userId)`** — reads the stored purchase hold via `userService.purchaseHoldOf`.
- **`describe('considerPurchaseHold')`** — main suite: threshold counting, idempotency, buyer-only attribution, staff-lift reset, configurable limit, notification shape, module wiring, graceful DB failure, missing-order no-op.
- **`describe('the pause counts what bots do')`** — verifies that `reservation_expired` and `withdrawal` causes are counted alongside buyer cancels, and that both "doors" combine toward the threshold.

## Relationships

- **`@modules/orders/services` (`orderService`)** — the system under test; calls `considerPurchaseHold`, `cancelOnRequestById`, `withdrawById`, `expireReservationById`.
- **`@modules/users` (`userService`)** — reads the hold (`purchaseHoldOf`) and performs `liftPurchaseHold` for the reset test.
- **`@modules/users/repository` (`userRepository`)** — read directly to assert `purchaseHoldFlaggedAt`.
- **`@modules/orders/events`** — `ORDER_CANCELLED` and `ORDER_PURCHASE_HOLD_PLACED` constants used for event emission and subscription.
- **`@modules/orders/module` (`ordersModule`)** — registered in the wiring test to verify the event handler is attached at module-registration time.
- **`@modules/orders/repository` (`orderRepository`)** — spied on to simulate a DB failure in the graceful-error test.
- **`@kernel/events`** — `onDomainEvent` / `emitDomainEvent` / `resetDomainEvents` drive the event-bus assertions; `DomainEventMap` types the fact array.
- **`@kernel/outbox` (`settleOutboxNudges`)** — flushed in the wiring test to let outbox-delivered events reach the handler.
- **`@kernel/registry` (`registerModules`)** — activates module event subscriptions in the wiring test.
- **`@kernel/access/tenant` (`DEPLOYMENT_TENANT_ID`)** — asserted on the notification fact.
- **`@infrastructure/adapters/mailer`** — mocked; the test asserts *that* `enqueueEmail` was called, not *what* was rendered.
- **`@infrastructure/adapters/logger`** — spied on to confirm the service logs (rather than throws) when the repository call fails.
- **`@modules/orders/tests/factories`** — `createOrder`, `toOrderItem` for order setup.
- **`@modules/products/tests/factories`** — `createProduct` for order items.
- **`@modules/users/tests/factories`** — `createUser`, `userRepository` for buyer setup.
- **`@domain-primitives/time` (`DAY_MS`)** — imported for duration assertions on the hold window (used in a truncated section).

## Notes

- The mailer mock resolves to `undefined` because the buyer-notification path chains a `.catch` onto the queue's promise; without a resolved value the catch would fire in the test.
- `placedFacts` is cleared manually in `beforeEach` (in addition to `resetDomainEvents` in `afterEach`), since the array is test-local state, not a kernel subscription.
- The wiring test (`registerModules` → `emitDomainEvent` → `settleOutboxNudges`) exercises the full outbox-delivery path; other tests call `considerPurchaseHold` directly.
- The failure-path test asserts the service **resolves** (not rejects) after a DB error, so downstream cancel-mail and subsequent events are not blocked.
- `DAY_MS` is imported from `@domain-primitives/time` for asserting the hold duration against the configured window.
