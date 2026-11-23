---
source: src/modules/orders/tests/integration/retention.test.ts
generated_at: 2026-11-22T06:32:29.115266+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/retention.test.ts

## Purpose
Integration tests for order PII retention. When an account is hard-deleted, its orders are detached from it (`userId` unset, PII clock started) rather than deleted. The `anonymizeDueOrders` sweep (the `reap:orders` job) then scrubs the remaining PII once the retention window has elapsed. The erasure half goes through real module wiring (`registerCheckoutModules` plus `eraseAsScheduled`). That way the tests fail if `src/modules/orders/module.ts` stops declaring the hook, which a direct service call would not catch.

## Key elements
- `redactedIds()`: returns the sorted `aggregateId`s of all `order.redacted` rows in `outboxEventModel`.
- `DAY`: one day in milliseconds, used to shift dates.
- `eraseAndSweep(build, overrides)`: creates a user, product and order, runs `build(orderId)`, erases the user, runs `orderService.anonymizeDueOrders()`, and returns `{ scrubbed, order }` with the reloaded order.
- `describe('orders — detach on account erasure')`:
  - A hard delete unsets `userId` and sets `piiClockStartedAt`.
  - The order itself survives.
  - A soft delete (`userService.removeById(..., false, admin)`) leaves the order untouched.
  - Other accounts' orders are not affected.
- `describe('orders — the claim window decides when a paid order loses its buyer')` covers the retention rules:
  - Never-paid orders, including canceled ones, are scrubbed on the first sweep. Email becomes `anonymized@deleted.invalid` and the clock is cleared.
  - A canceled order with late money is counted from the time set by `markOrderMoneyReceivedAt`, plus `NODE_ORDER_PII_DAYS_UNDELIVERED`.
  - A paid order is counted from `paidAt`, even if late money also arrived.
  - A delivered order waits until `conformityUntil`, plus `NODE_ORDER_PII_DAYS_AFTER_GUARANTEE`.
  - A paid, canceled and undelivered order uses `paidAt` plus the undelivered days.
  - An `it.each` over `paid`/`processing`/`shipped` shows these orders are not scrubbed at erasure. Once forced to `delivered`, they follow `conformityUntil`.
  - Shipping addresses are unset along with their country.
  - `order.redacted` is announced exactly once per scrub.
- `describe('orders — anonymizeDueOrders (reap-orders sweep)')`: direct sweep tests. The first case checks that the email is scrubbed and that both addresses and the notes are unset once the clock has started. The rest of this block is not covered here.

## Relationships
- `src/modules/orders/tests/factories.ts`: builds order fixtures and provides helpers that mutate order state directly (`detachOrderUserId`, `forceOrderStatus`, `markOrderPaidAt`, `markOrderMoneyReceivedAt`, `setConformityUntil`).
- `src/modules/users/tests/factories.ts`: supplies `createUser` and `eraseAsScheduled`, which triggers the erasure.
- `src/modules/products/tests/factories.ts`: supplies `createProduct`.
- `src/modules/orders/repository.ts`: `orderRepository.findById` reads orders back for assertions.
- `src/modules/orders/model.ts` (`orderModel`) and `src/infrastructure/persistence/versioning.ts` (`versionOf`): imported alongside the repository. The visible part of the file doesn't show how they are used.
- `src/modules/orders/services/index.ts`: `orderService.anonymizeDueOrders` is the sweep under test.
- `src/modules/users/index.ts` and `src/modules/users/services/index.ts`: `userService` is imported from the users module index. `userService.removeById` is used for the soft-delete case.
- `src/kernel/outbox.ts`: `outboxEventModel` is queried for `order.redacted` events.
- `src/kernel/events.ts`: `resetDomainEvents` is called in `afterEach`.
- `tests/support/callers.ts`, `tests/support/checkout-modules.ts`, `tests/support/environment.ts`: provide `callerContextAs`, `registerCheckoutModules` and `setEnvironment`. `asSuccess` comes from `@tests/response`, a path not in the graph neighbors.
- `src/types/index.ts`: provides `OrderStatus`, used for the statuses in the tests.
- `@tests/setup-test-db` (`setupTestDb`): called once at module level.

## Notes
- Each `describe` registers the checkout modules in `beforeEach` and calls `resetDomainEvents` in `afterEach`. The third `describe` has no visible hooks of its own.
- The retention windows are tuned with `setEnvironment` (`NODE_ORDER_PII_DAYS_UNDELIVERED`, `NODE_ORDER_PII_DAYS_AFTER_GUARANTEE`). The tests check boundaries by moving timestamps to just inside and just outside the window (for example 99 versus 101 days against a 100-day window).
- Several tests call `anonymizeDueOrders()` twice on the same order. The first call expects 0 and the second expects 1, so the sweep's return value is the count of orders scrubbed.
