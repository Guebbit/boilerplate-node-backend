---
source: src/modules/orders/tests/integration/purchase-hold.test.ts
sha256: 22878ddb1265bcead38402de853f7e05608423bdb55cf82cdc37239104014d54
generated_at: 2026-11-08T07:08:01.607464+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/purchase-hold.test.ts

## Purpose

Integration tests for the **purchase hold** feature: after a buyer's repeated cancellations (or bot-like expirations/withdrawals) within a configured window, their checkout is paused. The tests verify the counting rules, idempotency, staff-notification semantics, staff-lift reset, configurability via environment, and the module-level event wiring — all against a real test database.

## Key elements

- **`cancelOneAsBuyer` / `cancelOnePaidAsBuyer`** — helpers that create a real order (pending or paid) and cancel it via `orderService.cancelOnRequestById` with a customer caller context.
- **`withdrawOneUnpaid` / `letOneExpire`** — helpers exercising the two non-explicit "cancel" paths (withdrawal through returns, reservation expiry) that the hold also counts.
- **`buyerCanceled(orderId)`** — constructs the `order.canceled` event payload (`cause: 'customer'`) that `considerPurchaseHold` consumes.
- **`placedFacts`** — module-level array that accumulates `ORDER_PURCHASE_HOLD_PLACED` domain events via an `onDomainEvent` listener registered in `beforeEach`; the assertion surface for staff notifications.
- **`holdOf(userId)`** — reads the stored hold back through `userService.purchaseHoldOf`.
- **`flaggedAt(userId)`** — reads `purchaseHoldFlaggedAt` from `userRepository`.
- **`describe('considerPurchaseHold')`** — main suite: threshold counting, idempotent replay, buyer-only cause filtering, staff-lift restart, configurable limit, notification payload shape, module wiring, graceful failure on DB error, and no-op for missing orders.
- **`describe('the pause counts what bots do')`** — verifies that expired reservations (`cause: 'reservation_expired'`) and unpaid withdrawals (`cause: 'withdrawal'`) count toward the same threshold, and that the two "doors" are combined.

## Relationships

- **`orderService`** (`src/modules/orders/services/index.ts`) — the system under test; every test drives `considerPurchaseHold` (and the cancel/withdraw/expire helpers) through it.
- **`ORDER_CANCELED`, `ORDER_PURCHASE_HOLD_PLACED`** (`src/modules/orders/events.ts`) — the domain events the tests emit, subscribe to, and assert on.
- **`ordersModule`** (`src/modules/orders/module.ts`) — registered via `registerModules` in the wiring test to confirm the `order.canceled → considerPurchaseHold` subscription is declared by the module.
- **`orderRepository`** (`src/modules/orders/repository.ts`) — spied on (`findById` → reject) to simulate a DB outage in the failure-path test.
- **`enqueueEmail`** (`src/infrastructure/adapters/mailer.ts`) — mocked at the queue level; tests assert the queue was called (or not) rather than sending real mail.
- **`logger`** (`src/infrastructure/adapters/logger.ts`) — spied on to assert the error is logged and the call still resolves.
- **`emitDomainEvent`, `onDomainEvent`, `resetDomainEvents`** (`src/kernel/events.ts`) — event bus used to subscribe in `beforeEach`, emit in the wiring test, and reset in `afterEach`.
- **`settleOutboxNudges`** (`src/kernel/outbox.ts`) — called in the wiring test to flush any outbox writes before asserting.
- **`registerModules`** (`src/kernel/registry.ts`) — wires `ordersModule` so its event subscriptions activate.
- **`DEPLOYMENT_TENANT_ID`** (`src/kernel/access/tenant.ts`) — asserted in the notification-payload test.
- **`DAY_MS`** (`src/domain-primitives/time.ts`) — imported for hold-duration arithmetic in assertions.
- **`userService`** (`src/modules/users/index.ts`) — provides `purchaseHoldOf` and `liftPurchaseHold` (the staff-lift action).
- **`createUser`, `userRepository`** (`src/modules/users` factories / `src/modules/users/repository.ts`) — buyer fixture and direct flag lookup.
- **`createProduct`** (`src/modules/products/tests/factories.ts`) — product fixture for order items.
- **`createOrder`, `toOrderItem`** (`src/modules/orders/tests/factories.ts`) — order fixtures used by every helper.

## Notes

- The mailer mock asserts on the **queue** (`enqueueEmail`), not on rendered mail copy; `mockResolvedValue(undefined)` mirrors the production `.catch` chain so the promise never rejects mid-test.
- `placedFacts` is a **module-scoped** array (not a `let` inside `describe`); it is truncated in `beforeEach` and in the staff-lift test. Forgetting to clear it would leak assertions across tests.
- The only test that exercises the **full event pipeline** (module registration → outbox settle → `emitDomainEvent`) is the "is wired to order.canceled by the module" case; all others call `considerPurchaseHold` directly with a hand-built payload.
- The configurable-limit test uses `withEnvironmentOverrides` with `NODE_PURCHASE_HOLD_CANCEL_COUNT: '2'`, meaning the threshold and window are environment-driven, not hard-coded.
- The failure-path test asserts that `considerPurchaseHold` **resolves** (does not throw) after a DB error, protecting the surrounding cancel-mail and later-event flow from being blocked.
