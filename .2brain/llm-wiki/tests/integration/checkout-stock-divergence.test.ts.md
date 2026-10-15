---
source: tests/integration/checkout-stock-divergence.test.ts
sha256: 10efc5eaedb2c09f0a9c247650985f9ecf4ece476ff0681271386209f2cf3b65
generated_at: 2026-10-15T12:44:35.439488+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/checkout-stock-divergence.test.ts

## Purpose

Integration tests pinning the invariant that the `stocklevels` ledger is the source of truth at checkout when it disagrees with the product catalogue's cached stock counters. It covers the "cache over-reports availability" direction (the complementary half — "cache under-reports" — lives in `cart/tests/integration/stock.test.ts`), and verifies that a failed cache sync after a stock write neither blocks checkout nor permanently corrupts the cache.

## Key elements

- **`shopperBuyingThree(onHand)`** — Sets up a user with an address, a product with the given on-hand count, 3 units in the cart, and pickup shipping. Returns `{ user, product }`.
- **`setLevel(productId, onHand, reserved)`** — Directly overwrites the `stocklevels` row via `stockLevelModel.updateOne`, deliberately leaving the catalogue's cached copy untouched. This is the divergence injection point.
- **`levelOf(productId)`** — Reads back the `stocklevels` row (onHand, reserved) for assertions.
- **describe: "the cache says there is stock, the level collection says there is not"** — Four tests asserting checkout refuses (with `CART_INSUFFICIENT_STOCK`), sells exactly what the ledger holds, and never double-sells when the cache under-counts reservations.
- **describe: "the catalogue cache fails to sync after a stock write"** — Two tests mocking `productService.syncStockCache` to reject; verify checkout still succeeds, the level is correct, and the stale cache converges on the next product transition (order cancel → release).

## Relationships

- **`src/modules/cart/services/index.ts`** — Primary system under test: `cartService.orderConfirm` and `cartService.cartItemAddById` are the checkout entry points exercised.
- **`src/modules/inventory/model.ts`** — `stockLevelModel` is the authoritative ledger read by checkout; tests write to and read from it directly.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds the product; `countersOf` reads back the catalogue cache for convergence assertions.
- **`src/modules/products/repository.ts`** — `productRepository.syncStockCache` is called directly in the "under-counts reservations" test to corrupt the cache.
- **`src/modules/products/index.ts`** — `productService.syncStockCache` is spied on to simulate a failed sync in the second describe block.
- **`src/modules/orders/index.ts`** — `orderService.cancelById` triggers the release + re-sync that proves cache convergence.
- **`src/modules/orders/tests/factories.ts`** — `countOrders` asserts no order was persisted on refusal.
- **`src/modules/cart/repository.ts`** — `cartRepository.setShippingMethod` sets pickup in setup.
- **`src/modules/users/tests/factories.ts`** / **`src/modules/addresses/tests/factories.ts`** — `createUser`, `giveAddress` build the actor.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the domain-event bus between tests.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` is spied to suppress the expected sync-failure log.
- **`tests/support/callers.ts`** — `testCallerContext` and `asCustomer` supply the caller identity for service calls.

## Notes

- The test doc-block states explicitly that the shared factories keep cache and ledger coherent, which is why no *other* suite ever observes divergence. This file is the only place the two are intentionally desynchronised.
- `setLevel` writes `available: onHand - reserved` explicitly; the catalogue cache is never touched by this helper.
- The second describe block relies on the fact that `syncStockCache` is fire-and-forget (its rejection is logged, not thrown) — the test asserts `result.success === true` even though the sync "failed."
- Convergence is proven by performing a cancel (a stock release) and checking that the *release's own* sync call rewrites the cache from the ledger, not by a background retry.
