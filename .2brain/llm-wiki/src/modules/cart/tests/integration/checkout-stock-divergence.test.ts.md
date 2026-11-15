---
source: src/modules/cart/tests/integration/checkout-stock-divergence.test.ts
sha256: eb8b9d74a1abc3b71d38bb95a15080bba66d0b2d64558a4ed2578ebdd2185da4
generated_at: 2026-11-14T19:33:26.628360+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/checkout-stock-divergence.test.ts

## Purpose

Integration test that pins the invariant "the `stocklevels` ledger is the source of truth" whenever the catalogue's cached counters disagree with it. It covers two scenarios: (1) the cache over-reports availability (or under-reports reservations) and checkout must still honour the ledger, and (2) the post-checkout cache sync rejects and the checkout must not fail as a result. Together with `cart/tests/integration/stock.test.ts` (which pins the "cache sits low" half), this suite ensures a stale cache can neither oversell nor falsely refuse.

## Key elements

- **`shopperBuyingThree(onHand)`** – helper that creates a user, a product with the given `onHand`, adds 3 units to the cart, and sets the shipping method to `pickup`. Returns `{ user, product }`.
- **`levelOf(productId)`** – reads the raw counters (`onHand`, `reserved`) directly from the `stocklevels` collection via `stockLevelRepository.findByProductId`.
- **`describe('the cache says there is stock, the level collection says there is not')`** – four tests:
  - Refusal path: cache says 10, ledger says 2 → `orderConfirm` fails with `CART_INSUFFICIENT_STOCK`, no order created, level untouched.
  - The refusal error payload names the blocking line using ledger-derived data (requested 3, availability `insufficient_stock`), not cache data.
  - Edge sell: cache says 10, ledger says 3 → checkout succeeds, level moves to `{onHand: 3, reserved: 3}`.
  - Reservation guard: cache claims 0 reserved, ledger shows 8 reserved → checkout is refused; level unchanged.
- **`describe('the catalogue cache fails to sync after a stock write')`** – two tests:
  - `productService.syncStockCache` rejects → checkout still succeeds, level is correct, cache remains stale (reserved still 0).
  - Subsequent `orderService.cancelOnRequestById` triggers its own sync, which rewrites the cache to match the level (convergence on next transition).

## Relationships

- **`src/modules/cart/services/index.ts`** (`cartService`) – calls `addItemById` and `orderConfirm` (the checkout flow under test).
- **`src/modules/cart/repository.ts`** (`cartRepository`) – `setShippingMethod` used in test setup.
- **`src/modules/inventory/tests/factories.ts`** – `forceStockLevel` writes a known value into the `stocklevels` ledger for each test.
- **`src/modules/inventory/repository.ts`** (`stockLevelRepository`) – `findByProductId` provides the read-back of ledger counters asserted in every test.
- **`src/modules/products/tests/factories.ts`** – `createProduct` and `countersOf` (reads the cached counters for assertions).
- **`src/modules/products/repository.ts`** (`productRepository`) – `syncStockCache` is called directly in the reservation-guard test to force a stale cache.
- **`src/modules/products/index.ts`** (`productService`) – `syncStockCache` is spied/mocked to simulate a sync failure.
- **`src/modules/orders/index.ts`** (`orderService`) – `cancelOnRequestById` drives the convergence test.
- **`src/modules/orders/tests/factories.ts`** – `countOrders` asserts no order was created on refusal.
- **`src/modules/users/tests/factories.ts`** – `createUser` for the shopper.
- **`src/modules/addresses/tests/factories.ts`** – `giveAddress` to satisfy the checkout pre-flight.
- **`src/kernel/events.ts`** – `resetDomainEvents()` in `beforeEach` isolates event-bus state between tests.
- **`src/infrastructure/adapters/logger.ts`** (`logger`) – spied (`jest.spyOn(logger, 'error')`) to silence the expected error log when the sync rejects.

## Notes

- The module docstring explicitly states this file is the *complement* to `cart/tests/integration/stock.test.ts`; the two together cover both directions of cache/ledger disagreement.
- The "sync failure" tests rely on the design decision that a rejected `syncStockCache` is logged and swallowed (does not propagate to the caller). The tests assert this by expecting `result.success === true` while the cache is provably stale.
- Convergence is not guaranteed to be *immediate*; it happens on the next state transition for that product (here, a cancel/release). The test does not assert the cache is corrected by the checkout itself.
- `registerCheckoutModules()` from `@tests/checkout-modules` must be called before any checkout-related assertion; it is set up in `beforeEach` alongside `resetDomainEvents()`.
