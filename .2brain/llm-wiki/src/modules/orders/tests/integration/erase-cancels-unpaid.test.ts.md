---
source: src/modules/orders/tests/integration/erase-cancels-unpaid.test.ts
sha256: 65361dc0f7547f7074c8469259e06f1aa57fb86f1cdec137aae9cc10a664c54b
generated_at: 2026-10-29T04:52:51.406844+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/erase-cancels-unpaid.test.ts

## Purpose

Integration test verifying that a hard-delete ("erase") of a user account cancels all of that user's unpaid orders by going through the inventory reservation sweep (releasing stock holds), while paid orders are only detached (anonymized) and never cancelled. The test drives the flow through `userService.remove` with real module wiring so it would fail if the orders module stopped registering the erasure hook.

## Key elements

- **`heldOrderFor(user, quantity)`** — Helper that creates a pending order with a real inventory reservation (`inventoryService.reserveForOrder`), returning the order and product for assertions.
- **`describe('orders — erasing an account…')`** — The test suite covering:
  - Cancel + stock release (reserved → 0)
  - Stock ledger shows `reserve` then `release` movements
  - PII detachment (`userId` cleared, `piiClockStartedAt` set)
  - Multiple unpaid orders all cancelled
  - No email enqueued to the erased address
  - Analytics emits `ORDER_CANCELLED`, **not** `ORDER_RESERVATION_EXPIRED`
  - Paid order stays `paid`, only detached
  - Already-cancelled order is untouched
  - Another account's pending order is unaffected
  - Soft delete (`removeById(id, false)`) does **not** cancel orders
- **Mocks** — `enqueueEmail` (queue-level, asserts no mail sent) and `emitAnalyticsEvent` (replaced, not spied; see `tests/support/ports.ts`).

## Relationships

- **`src/modules/users/tests/factories.ts`** — `createUser`, `eraseAsScheduled` (the "hard delete" trigger under test).
- **`src/modules/users/index.ts`** — `userService.removeById` used in the soft-delete negative test; `callerContextAs` from `tests/support/callers.ts` provides the admin context.
- **`src/modules/inventory/index.ts`** — `inventoryService.reserveForOrder` (setup) and `inventoryService.listMovements` (ledger assertion).
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `markOrderPaidAt`, `readOrder`, `forceOrderStatus`.
- **`src/modules/products/tests/factories.ts`** — `createProduct`, `countersOf` (stock counter assertions).
- **`src/modules/orders/analytics.ts`** — `ordersAnalyticsEvents` constants used in the analytics assertion.
- **`src/infrastructure/adapters/mailer.ts`** — Mocked; asserts no cancellation email is queued.
- **`src/infrastructure/observability/analytics/index.ts`** — Mocked (`emitAnalyticsEvent`); observed via `observePort` from `tests/support/ports.ts`.
- **`src/kernel/events.ts`** — `resetDomainEvents` in `afterEach` to prevent cross-test event leakage.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires the real module graph in `beforeEach`.
- **`src/types/index.ts`** — `OrderStatus`, `StockMovementReason` enums.

## Notes

- The test deliberately goes through `userService.remove` rather than invoking the erasure hook directly. The file docblock states this is to catch a regression where `orders/module.ts` stops registering the hook.
- `enqueueEmail` is mocked at the **queue** level (not the mail-copy level); the assertion is "no mail goes out to an erased address," not "no mail object is constructed."
- The analytics port is **replaced** (full mock) rather than spied on; see `tests/support/ports.ts` for the project rationale.
- `eraseAsScheduled` (from users factories) is the hard-delete path; `userService.removeById(id, false, …)` is the soft-delete path. Only the former triggers order cancellation.
- `setupTestDb()` runs once at module level; `registerCheckoutModules()` and mock clears run per-test.
