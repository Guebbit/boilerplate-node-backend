---
source: src/modules/orders/tests/factories.ts
generated_at: 2026-11-22T06:26:03.071439+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/factories.ts

## Purpose
Test-database order factories and helpers. It wraps the pure order builder in `src/modules/orders/factories.ts`, which takes a product snapshot as data, so tests can build and persist orders from real product documents. It also holds seeding, raw-state read/write and timeline-reading helpers for order tests. Order items embed a full product snapshot rather than a reference, so repricing a product later doesn't change what a customer was charged.

## Key elements
- `toOrderItem(product, quantity?, locale?)`: converts a persisted `ProductDocument` into an `OrderLineInput`. It copies the whole `toObject()` minus `_id`/`__v`/`taxClass`, sets `id` and the resolved `taxRate` (via `resolveTaxRate`), and adds `preorder: true` when `isPreorder` is true for the current date.
- `makeOrder(user, items, extras?)`: builds an `OrderFixture` through the base builder from the user's id and email, the items and any `OrderExtras`. `extras` passes through without defaults, so shipping columns stay unset unless a test sets them.
- `createOrder(user, items, extras?)`: persists `makeOrder(...)` via `orderRepository.create`.
- `seedOrder(status)`: creates a fresh user and product, then an order with one line forced to `status`.
- `seedDigitalOrder(status, paidAt?)`: the same, but with a `requiresShipping: false` product. It optionally sets `paidAt` afterwards.
- `readOrder`, `findOrder`, `countOrders`: raw repository reads for test assertions (by id, first match by filter, count by filter).
- `orderRepository`: re-exported, so siblings can `jest.spyOn` the live repository object.
- `forceOrderStatus(orderId, status)`: writes a status through `orderRepository.updateStatusIfIn`, allowing every `OrderStatus` value as the current one, to reach states the API can't produce.
- `detachOrderUserId(userId, piiClockStartedAt)`: unsets `userId` on that user's orders, sets `piiClockStartedAt`, and returns the modified count.
- `markOrderPaidAt`, `markOrderMoneyReceivedAt`: stamp `paidAt` / `moneyReceivedAt` directly, with `timestamps: false`.
- `setWithdrawUntil`, `setConformityUntil`: set or, given `undefined`, unset the frozen deadline fields.
- `timelineAs(orderId, authContext)`: reads page 1 at page size 100 via `readTimeline`, parses it with `GetOrderTimeline200Response`, and returns the entries oldest-first.
- `timelineOf(orderId, typePrefix?)`: `timelineAs` as an admin (`asAdmin()`), filtered by type prefix.
- `lastOverrideOf(orderId)`: the last `status_overridden` timeline entry.

## Relationships
- Builds on `src/modules/orders/factories.ts` (`makeOrder` as `buildOrder`, plus the `OrderFixture`, `OrderLineInput` and `OrderOverrides` types) and uses `../repository`, `../model` and `../services/timeline`.
- Uses `createUser` and `createProduct` from the users and products test factories, and `isPreorder` / `resolveTaxRate` from `@modules/products`.
- Uses `toObjectId` from `src/infrastructure/persistence/create-repository.ts` for direct `orderModel` updates.
- Is imported by the cart integration and contract tests, the addresses checkout test, the account shop contract test and the delivery API contract test, which use it to seed and inspect orders.
- `src/modules/delivery/tests/factories.ts` is a neighboring factory file in the delivery module.

## Notes
- `forceOrderStatus` and the `mark*` / `set*` helpers bypass lifecycle rules and are for tests only. `orderService` has no unconditional status writer.
- `paidAt` and `moneyReceivedAt` are not `OrderOverrides` keys, so they can only be set through these helpers.
- Because `timelineAs` parses the page through the contract's response schema, every timeline read also checks the stored rows against the contract.
- `timelineAs` and `timelineOf` reverse the newest-first page into oldest-first order.
- `orderRepository` is re-exported rather than wrapped because a wrapper can't intercept internal calls such as `placeOrder`'s rollback. The file says to use it only for "was this method called/failed" assertions.
