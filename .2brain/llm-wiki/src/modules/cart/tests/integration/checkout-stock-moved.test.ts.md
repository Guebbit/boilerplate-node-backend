---
source: src/modules/cart/tests/integration/checkout-stock-moved.test.ts
source_sha256: 178ef25c982365e9f8325e570d7b8923d1f30bf02707dba9a08e61b409654469
context_sha256: bdde7d1e88e90fcd5cf2687f4349ac031ad0aec1ac7fcf8480450e03cb3d0ed3
generated_at: 2026-11-22T04:38:45.775045+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/checkout-stock-moved.test.ts

## Purpose
Integration test suite verifying that checkout behaves correctly when stock changes between adding a line to the cart and confirming the order (e.g. another buyer or a staff adjustment). It asserts that the pre-flight check and the hold (`reserveForOrder`) read the `stocklevels` ledger, so changes made behind the cart's back neither oversell nor falsely refuse a purchase.

## Key elements
- `shopperBuyingThree(onHand)` — helper that creates a user with an address, a product with the given `onHand`, adds 3 units to the cart, and sets the shipping method to `'pickup'`. Returns `{ user, product }`.
- `levelOf(productId)` — helper that reads `onHand` and `reserved` from the stock level row via `stockLevelRepository.findByProductId`.
- `describe('the level moves after the line was added to the cart')` — four cases, each calling `cartService.orderConfirm(user.id, testCallerContext, undefined)` after `forceStockLevel` alters the level:
  - Level dropped to 2 on hand: checkout fails with `CART_INSUFFICIENT_STOCK`, no order is created, and the level stays `{ onHand: 2, reserved: 0 }`.
  - Same refusal's `details` names the blocking line (`productId`, `title`, `requested: 3`, `availability: 'insufficient_stock'`).
  - Level of exactly 3: checkout succeeds and the level becomes `{ onHand: 3, reserved: 3 }`.
  - Level 10 on hand with 8 reserved by others: checkout fails and the level is unchanged.

## Relationships
- `src/modules/cart/services/index.ts` — exports `cartService`, the code under test (`addItemById` for setup, `orderConfirm` for the checkout).
- `src/modules/cart/repository.ts` — exports `cartRepository`; `setShippingMethod` is used in setup.
- `src/modules/inventory/tests/factories.ts` — supplies `forceStockLevel` (sets `onHand`/`reserved` directly) and `stockLevelRepository` (reads the level back). The `src/modules/inventory/repository.ts` neighbor is not imported directly here.
- `src/modules/products/tests/factories.ts`, `src/modules/users/tests/factories.ts`, `src/modules/addresses/tests/factories.ts` — `createProduct`, `createUser`, `giveAddress` for fixtures.
- `src/modules/orders/tests/factories.ts` — `countOrders` to assert that no order was created on refusal.
- `src/kernel/events.ts` — `resetDomainEvents()` is called in `beforeEach`.
- `tests/support/checkout-modules.ts` — `registerCheckoutModules()` re-registers the modules checkout needs, in `beforeEach`.
- `tests/support/setup-test-db.ts` — `setupTestDb()` sets up the test database.
- `tests/support/callers.ts` — `testCallerContext` is passed to `orderConfirm`.

## Notes
- Imports use the `@tests/...` alias for support files and `@modules/...`/`@kernel/...` for source.
- Refusal cases assert that no units moved, so the level is checked after the failed checkout, not just the result.
