---
source: src/modules/orders/tests/integration/erase-cancels-unpaid.test.ts
sha256: b364b311653f81b12dac27d80f14c62afbab5aa15b16d3e85543739e1bdd6fe6
generated_at: 2026-10-15T11:14:07.022352+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/erase-cancels-unpaid.test.ts

## Purpose

Integration test verifying that a hard-delete of a user account cancels all of that user's never-paid orders and releases their stock reservations, while leaving paid (invoice) orders in place. The test drives the flow through `userService.remove` with the real module wiring rather than calling the order-cancel hook directly, so it would fail if `orders/module.ts` stopped registering the erasure hook.

## Key elements

- **`heldOrderFor(user, quantity?)`** — Local helper that creates a product with 10 units on hand, creates a pending order for the user, and calls `inventoryService.reserveForOrder` to actually hold stock. Asserts the hold succeeded.
- **`describe('orders — erasing an account cancels its never-paid orders')`** — Nine test cases covering:
  - Order cancelled + reserved stock released to available.
  - Stock ledger shows a `reserve` followed by a `release` entry for the order.
  - Order is detached (no `userId`) and `anonymizeAfter` is set.
  - Multiple pending orders are all cancelled and all reservations released.
  - No email is enqueued to the erased address (mailer mock).
  - Analytics emits `ORDER_CANCELLED`, not `ORDER_RESERVATION_EXPIRED`.
  - A paid order stays `paid`; only its user link is removed.
  - An already-cancelled order is untouched.
  - Another user's pending order is unaffected.
  - A soft delete (`remove(user, false)`) does **not** cancel the order.
- **Mailer mock** — Replaces the entire module (queue, not copy) so the assertion is that no mail is enqueued at all.
- **Analytics port mock** — Replaced (not spied) per `tests/support/ports.ts` convention; asserted via `observePort`.

## Relationships

- **`src/modules/users/index.ts`** — Source of `userService`; `userService.remove` is the entry point for every test case.
- **`src/modules/inventory/index.ts`** / **`src/modules/inventory/services/index.ts`** — `inventoryService.reserveForOrder` (in `heldOrderFor`) and `inventoryService.listMovements` (ledger assertion).
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `markOrderPaidAt`, `readOrder`, `forceOrderStatus`.
- **`src/modules/products/tests/factories.ts`** — `createProduct`, `countersOf`.
- **`src/modules/users/tests/factories.ts`** — `createUser`.
- **`src/kernel/events.ts`** — `resetDomainEvents` called in `afterEach`.
- **`src/infrastructure/adapters/mailer.ts`** — Fully mocked; test asserts zero calls.
- **`src/infrastructure/observability/analytics/index.ts`** — Mocked (replaced); `emitAnalyticsEvent` captured via `observePort`.
- **`src/modules/orders/analytics.ts`** — `ordersAnalyticsEvents` constants used in assertions.
- **`src/types/index.ts`** — `OrderStatus`, `StockMovementReason` enums.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules()` in `beforeEach` to wire the real order/inventory/user modules.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` for in-memory DB.
- **`tests/support/ports.ts`** — `observePort` helper; also the rationale comment for the analytics mock style.

## Notes

- The test intentionally does **not** call the order-cancel hook directly. If `orders/module.ts` forgets to register the erasure listener, these tests go red even though the hook itself works.
- `userService.remove(user, true)` is hard delete; `remove(user, false)` is soft delete. Only the hard path triggers cancellation.
- The mailer mock replaces the module (not a spy on the exported function) so that *any* code path that imports `enqueueEmail` is captured — the docblock calls this "the queue, not the copy."
- The analytics mock uses the "replace, don't spy" pattern documented in `tests/support/ports.ts`; mixing the two would double-count events.
