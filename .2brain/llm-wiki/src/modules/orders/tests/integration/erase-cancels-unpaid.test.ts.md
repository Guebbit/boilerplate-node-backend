---
source: src/modules/orders/tests/integration/erase-cancels-unpaid.test.ts
source_sha256: 12e48e9df4312b7bd7c3b1ff477843dd73e91da2b75b8d8cbf741ea8a9949777
context_sha256: 7923ecd2e2db50504607251f0c6bdb343302f2fa7b218f8848548698df0a751e
generated_at: 2026-11-22T06:27:41.092378+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/erase-cancels-unpaid.test.ts

## Purpose
Integration test suite verifying that erasing a user account cancels the account's never-paid orders. The cancel goes through the same path as the reservation sweep, so held stock is released, and it happens only after the erasure has committed. Paid orders are the invoice, so they are only detached, never canceled. The tests drive `userService.remove` through the real module wiring (via `registerCheckoutModules`). A direct call to the hook would still pass if `src/modules/orders/module.ts` stopped registering it.

## Key elements
- `mockEnqueueEmail`: typed handle on the `jest.fn()` that replaces `enqueueEmail` from the mailer adapter. Cases assert on which mail was enqueued.
- `jest.mock` of `@infrastructure/observability/analytics`: keeps the real exports but replaces `emitAnalyticsEvent` with `jest.fn()`.
- `heldOrderFor(user, quantity = 3)`: helper that creates a product (`onHand: 10`) and a pending order, then calls `inventoryService.reserveForOrder` so the units are really held, as checkout leaves them. Returns `{ order, product }`.
- `beforeEach` / `afterEach`: clear the mail mock and call `registerCheckoutModules()` before each test, then `resetDomainEvents()` after each.
- Test cases, in the `describe` block "orders — erasing an account cancels its never-paid orders":
  - Cancels the order and returns the held units (`reserved` goes 3 → 0, `available` returns to 10).
  - Leaves a `reserve` then a `release` movement in the stock ledger.
  - Still detaches the order: `userId` is unset and `piiClockStartedAt` is set.
  - Cancels every never-paid order of the account, not just one.
  - Enqueues no mail to the erased address.
  - Emits `ORDER_CANCELED` and not `ORDER_RESERVATION_EXPIRED`.
  - Leaves a paid order `paid` but detached.
  - Leaves an already-canceled order canceled.
  - Does not touch another account's pending order or its reservation.
  - Cancels nothing on a soft delete (`userService.removeById(user.id, false, callerContextAs('admin'))`).

## Relationships
- `@modules/users/tests/factories` supplies `createUser` and `eraseAsScheduled`. `eraseAsScheduled` triggers the erasure under test.
- `@modules/users` (`userService`) is called directly only for the soft-delete case.
- `@modules/orders/tests/factories` supplies `createOrder`, `toOrderItem`, `markOrderPaidAt`, `readOrder` and `forceOrderStatus` for building and inspecting orders.
- `@modules/products/tests/factories` supplies `createProduct` and `countersOf`, which reads `onHand`, `reserved` and `available`.
- `@modules/inventory` (`inventoryService`) is used for `reserveForOrder` and `listMovements`, to check the stock ledger.
- `@modules/orders/analytics` supplies `ordersAnalyticsEvents` (`ORDER_CANCELED`, `ORDER_RESERVATION_EXPIRED`) for the analytics assertions.
- `@infrastructure/adapters/mailer` is mocked (`enqueueEmail`).
- `@infrastructure/observability/analytics` is partly mocked (`emitAnalyticsEvent`) and observed with `observePort` from `@tests/ports`.
- `@kernel/events` supplies `resetDomainEvents`, which isolates event wiring between tests.
- `@tests/checkout-modules` supplies `registerCheckoutModules`, the real module wiring. `@tests/callers` supplies `callerContextAs`. `@tests/setup-test-db` supplies `setupTestDb`.
- `@types` supplies the `OrderStatus` and `StockMovementReason` enums.

## Notes
- The mailer is mocked at the queue level on purpose: the check is that nothing is queued for an erased account's address, regardless of the email copy.
- The analytics module is replaced rather than spied on; the reason is documented in `tests/support/ports.ts`.
- The soft-delete case expects the order to stay `pending`, because the account can still come back.
