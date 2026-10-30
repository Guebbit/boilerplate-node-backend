---
source: src/modules/cart/tests/integration/checkout-stock-divergence.test.ts
sha256: ca330aa00793509a0b0995417e22c8648c14ea5e3a4cf7426734f43c631d6744
generated_at: 2026-10-29T03:27:38.384606+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/checkout-stock-divergence.test.ts

## Purpose

Integration test that pins the stock-authority invariant at checkout: when the product catalogue's cached counters and the `stocklevels` ledger disagree, the ledger is the source of truth. It verifies that a stale cache can neither cause an oversell nor a false refusal, and that a failed cache-sync after a write does not break the hold or delay convergence to the correct state.

## Key elements

- **`shopperBuyingThree(onHand)`** — Sets up a user, an address, a product with the given `onHand` cache value, adds 3 units to the cart, and selects pickup shipping. Returns `{ user, product }`.
- **`levelOf(productId)`** — Reads the `stocklevels` row directly and returns `{ onHand, reserved }`, bypassing the catalogue cache.
- **`describe("the cache says there is stock, the level collection says there is not")`** — Four cases:
  - Checkout is refused with `CART_INSUFFICIENT_STOCK` when the level has fewer units than requested; no order is created and the level is untouched.
  - The refusal error details name the blocking line using the level's availability, not the cache.
  - When the level holds exactly the requested quantity (cache over-reports), checkout succeeds and the level is correctly reserved.
  - When the cache under-counts reservations (says 0 reserved, level says 8), the same units are not sold a second time.
- **`describe("the catalogue cache fails to sync after a stock write")`** — Two cases:
  - Checkout still succeeds (hold applies to the level) even though `productService.syncStockCache` rejects; the cache remains stale.
  - On the next state transition (order cancellation/release), the level is updated and the cache converges to match it.

## Relationships

- **`src/modules/cart/services/index.ts`** — `cartService.addItemById` and `cartService.orderConfirm` are the system under test.
- **`src/modules/cart/repository.ts`** — `cartRepository.setShippingMethod` used in setup.
- **`src/modules/inventory/tests/factories.ts`** — `forceStockLevel` creates the deliberate cache/ledger divergence; `stockLevelRepository` reads the ledger for assertions.
- **`src/modules/products/tests/factories.ts`** — `createProduct`, `countersOf` (read cache state), `productRepository.syncStockCache` (simulate a stale write in the double-sell test).
- **`src/modules/products/index.ts`** — `productService.syncStockCache` is spied on to simulate a sync failure.
- **`src/modules/products/repository.ts`** — `productRepository.syncStockCache` called directly to set a stale cache row.
- **`src/modules/orders/index.ts`** — `orderService.cancelOnRequestById` triggers the release path in the convergence test.
- **`src/modules/orders/tests/factories.ts`** — `countOrders` asserts no order was created on refusal.
- **`src/modules/users/tests/factories.ts`** — `createUser` for test fixture.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` for test fixture.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` spied on to silence expected error logs during sync-failure tests.
- **`src/kernel/events.ts`** — `resetDomainEvents()` called in `beforeEach` to isolate event-bus state between tests.

## Notes

- The module docstring explicitly pairs this file with `cart/tests/integration/stock.test.ts`: that file pins the "cache sits low" half at checkout; this file covers the divergence and sync-failure scenarios.
- `forceStockLevel` writes directly to the `stocklevels` collection, creating a known-divergent state without going through the normal domain flow.
- In the sync-failure test, the test asserts the cache is *not* corrected by a refused checkout — the invariant is that only a successful state transition (hold, release, etc.) rewrites the cache.
- `jest.restoreAllMocks()` in `afterEach` is critical because `productService.syncStockCache` is spied; forgetting to restore would leak the mock into other suites in the same worker.
