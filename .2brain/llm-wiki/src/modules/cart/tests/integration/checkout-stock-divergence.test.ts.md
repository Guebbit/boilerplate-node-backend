---
source: src/modules/cart/tests/integration/checkout-stock-divergence.test.ts
sha256: ca330aa00793509a0b0995417e22c8648c14ea5e3a4cf7426734f43c631d6744
generated_at: 2026-11-08T05:20:24.898673+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/checkout-stock-divergence.test.ts

## Purpose

Integration test that verifies checkout always defers to the `stocklevels` ledger when it disagrees with the product catalogue's cached stock counters. It pins the invariant that the ledger is the source of truth: a stale cache can neither cause an oversell (cache under-reports reservations) nor a false refusal (cache over-reports availability). The complementary half—cache sitting *low* at checkout—is covered by the sibling `stock.test.ts`.

## Key elements

- **`shopperBuyingThree(onHand)`** — Test helper. Creates a user, a product with the given `onHand`, adds 3 units to the cart, and sets the shipping method to `pickup`.
- **`levelOf(productId)`** — Reads the `onHand`/`reserved` counters directly from the `stocklevels` collection (bypasses the product cache).
- **`describe('the cache says there is stock, the level collection says there is not')`** — Four tests covering: refusal with no order created, error payload sourced from the ledger, exact-quantity sell when ledger has just enough, and double-sell prevention when cache under-reports `reserved`.
- **`describe('the catalogue cache fails to sync after a stock write')`** — Two tests confirming that a failed `productService.syncStockCache` does not block the hold, and that the cache converges on the next domain transition (order cancellation release).

## Relationships

- **`src/modules/cart/services/index.ts`** — System under test: `cartService.addItemById`, `cartService.orderConfirm` are exercised directly.
- **`src/modules/cart/repository.ts`** — `cartRepository.setShippingMethod` used in setup.
- **`src/modules/products/tests/factories.ts`** — `createProduct`, `countersOf`, `productRepository` (for `syncStockCache` manipulation and cache assertions).
- **`src/modules/products/index.ts` / `src/modules/products/services/index.ts`** — `productService.syncStockCache` is spied on to simulate a sync failure.
- **`src/modules/inventory/tests/factories.ts`** — `forceStockLevel` writes the ledger to a divergent value; `stockLevelRepository.findByProductId` reads it back.
- **`src/modules/orders/index.ts` / `src/modules/orders/services/index.ts`** — `orderService.cancelOnRequestById` triggers the release path that re-syncs the cache.
- **`src/modules/orders/tests/factories.ts`** — `countOrders` asserts no order was persisted on refusal.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` satisfies the checkout pre-flight requirement.
- **`src/modules/users/tests/factories.ts`** — `createUser` for the shopper fixture.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` is spied on to suppress expected error logs during the sync-failure tests.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears event state between tests.

## Notes

- The file's leading doc comment states the design invariant explicitly: "the ledger has the last word." All assertions in the "cache over-reports" block check that the ledger's numbers are untouched after a refusal.
- `forceStockLevel` + `productRepository.syncStockCache` are the two levers used to *create* the divergence; the factories' normal path keeps them in lockstep, which is why no other suite encounters a mismatch.
- The sync-failure tests mock `productService.syncStockCache` to reject once, then assert the hold still succeeded and the cache remains stale until the next transition writes it back.
- Uses `setupTestDb()` and `registerCheckoutModules()` (from `@tests/`) for full integration wiring against a real test database.
