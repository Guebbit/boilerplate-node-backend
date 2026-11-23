---
source: src/modules/orders/tests/integration/cancel.test.ts
source_sha256: 27e8fdadc590ea84af60c807e98026fdf3dffb518f723cdb9900f707a1f9bfcb
context_sha256: 1e12ab9e206b242ea7342be96285a1cdadb657c2a1063d0320ff15547877cb06
generated_at: 2026-11-22T06:26:44.261346+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/cancel.test.ts

## Purpose
Integration tests for the order cancellation entry points: `orderService.cancelOnRequestById` (customer, admin, moderator callers) and the system-actor path `cancelForErasureById`. The tests pin the invariants that make customer-facing cancellation safe: the status gate and the write are one atomic statement, the caller's scope is part of that statement, and the refusal reasons map to distinct HTTP statuses.

## Key elements
- **Mocks**
  - `@infrastructure/adapters/mailer` is replaced so `enqueueEmail` is a `jest.fn()` (`mockEnqueueEmail`). The tests assert on the queue, not the email copy.
  - The audit port is replaced with `auditPortMock()` from `@tests/ports`, not spied on. The file's comment says `jest.spyOn` fails against the non-configurable CommonJS getter under the swc mutation config and in Stryker's sandbox.
  - `emitAnalyticsEvent` is replaced with `jest.fn()`. The other analytics exports are kept via `requireActual`.
- **Helpers**
  - `setupTestDb()` sets up the test database.
  - `afterEach` calls `jest.restoreAllMocks()`.
  - `seedOrder(user)` creates a product and a one-item order.
  - `asUser(user)` builds a customer caller.
- **`describe('cancelOnRequestById')`**
  - An owner can cancel a pending order.
  - Another user's order returns 404, the same as a missing order, and the order is left unchanged.
  - A shipped order returns 409 with the code `ORDER_NOT_CANCELABLE`.
  - An admin can cancel an order they do not own.
  - Only an admin can cancel a `processing` order. The customer gets 409 and the admin succeeds.
  - The system actor (`cancelForErasureById`) cannot cancel a `paid` order and gets 409. The test title refers to this as closing "B21's race".
  - A soft-deleted order returns 404 for its owner.
- **`describe('… who gets their money back')`**
  - Subscribes to `ORDER_CANCELED` via `onDomainEvent` and collects payloads.
  - Calls `markDomainEventsWired()` in `beforeEach` and `resetDomainEvents()` in `afterEach`.
  - Delivery is flushed with `settleOutboxNudges()`.
  - A customer always gets a refund, even with `refund: false`. The expected payload has `cause: 'customer'` and an `informedAt` string.
  - An admin can pass `refund: false`, and the payload has `cause: 'operator'`.
  - An admin who passes no option refunds by default.
  - A moderator can also skip the refund. The test pins the bug where `update:Order` is held by name rather than through the scope wildcard.
  - The event is emitted even when no refund is made.
- **`describe('… audit and analytics')`**
  - Uses `observePort` on `emitAuditEvent` and `emitAnalyticsEvent`.
  - The first visible case checks that a customer cancel reports `order_canceled`, audited as the customer. The file is cut off after that.

## Relationships
- **Code under test:** `orders/services` (`orderService`) and `services/cancel` (`cancelForErasureById`).
- **Orders module:** `repository` (`orderRepository`, used for seeding and asserting state via `updateStatusIfIn`, `save` and lookups), `model` (`orderModel`), `events` (`ORDER_CANCELED`), `audit` (`ordersAuditActions`), `analytics` (`ordersAnalyticsEvents`), and `module` (`ordersModule`).
- **Kernel:** `events` (`markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents`), `outbox` (`outboxEventModel`, `settleOutboxNudges`), and `registry` (`registerModules`). The imports of `orderModel`, `outboxEventModel`, `registerModules`, `ordersModule`, `ordersAuditActions`, `ordersAnalyticsEvents`, `userService` and `OrderStatus` are not used in the visible portion.
- **Infrastructure:** the mocked `adapters/mailer`, and the `observability/audit` and `observability/analytics` ports.
- **Test support:** `orders/tests/factories` (`createOrder`, `markOrderPaidAt`, `setWithdrawUntil`, `timelineOf`, `toOrderItem`), the users and products factories, `@tests/callers`, `@tests/ports` and `@tests/setup-test-db`.

## Notes
- Cancellation permissions depend on the caller's role:
  - A customer can cancel only `pending` orders.
  - An admin can also cancel `processing` orders.
  - The system actor holds only the `pending → canceled` edge.
- `updateStatusIfIn(id, [allowedFrom], to)` is used directly to move orders into states such as `shipped`, `processing` and `paid`.
- In the ownership tests, the owner is created with `username: 'admin'`. This looks like a fixture detail and does not grant admin rights, because the caller role comes from `asAdmin()` and `asUser()`.
