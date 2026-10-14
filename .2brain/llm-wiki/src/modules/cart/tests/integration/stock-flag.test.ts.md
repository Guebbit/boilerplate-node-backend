---
source: src/modules/cart/tests/integration/stock-flag.test.ts
sha256: 7e7acdc6900c3ef7eabfb098817ebdc58ac6be96a7ddcff4be1dc82500576301
generated_at: 2026-10-14T15:18:18.343336+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/stock-flag.test.ts

## Purpose

Integration tests verifying two invariants of cart-line availability: (1) each line in `GET /cart` and `POST /cart/merge` carries the correct `availability` name (`in_stock`, `insufficient_stock`, `out_of_stock`, `removed`) derived from the stock ledger and catalogue, and (2) no field in any cart response ever exposes a numeric stock quantity—the flag is a name, never a count.

## Key elements

- **`flagOf(userId)`** — Convenience helper that calls `cartGetForView` and returns the `availability` of the first line.
- **`keysOf(value)`** — Recursively collects every key in a nested JSON structure (objects and arrays) so responses can be scanned for stock-like field names.
- **`shortCartBody(onHand, bearer)`** — Creates a product, adds 999 units to the cart via `POST /cart`, then fetches both `GET /cart` and `POST /cart/merge` responses for later comparison.
- **`anonymised(body, id)`** — Replaces a specific product ID with a placeholder so two responses can be compared structurally without ID noise.
- **`describe('GET /cart's line availability')`** — Seven cases covering: in-stock vs. insufficient after ledger adjustment; ledger-over-cache precedence; boundary (qty = onHand); sold-out; reserved units from another open order; product soft-removed and hard-deleted (the "window before the pull"); per-line independence in a multi-line cart.
- **`describe('the availability never carries a number')`** — Two cases asserting (a) identical availability output for 1 vs. 500 on the shelf across both `GET /cart` and `POST /cart/merge`, and (b) zero keys matching `/available|onhand|reserved|remaining|left|stock/i` anywhere in either response body.

## Relationships

- **`src/infrastructure/config/store.ts`** — `overrideEnvironment` / `resetEnvironmentOverrides` raise `NODE_CART_LINE_MAX` to 999 so the 999-unit test lines are legal.
- **`src/kernel/events.ts`** — `resetDomainEvents` suppresses the product-removal listener that would otherwise pull the line from the cart, creating the "window before the pull" the removed-flag tests observe.
- **`src/modules/cart/services/index.ts`** — Source of `cartItemAddById`, `cartGetForView`, and `orderConfirm` used throughout.
- **`src/modules/cart/repository.ts`** — `cartRepository.setShippingMethod` sets a shipping method before confirming an order in the reserved-stock test.
- **`src/modules/cart/services/checkout.ts`** — Exposed via `orderConfirm` (re-exported from services index) to drive the reservation that reduces available stock.
- **`src/modules/inventory/index.ts`** — `inventoryService.adjust` decrements the stock ledger to flip a line from `in_stock` to `insufficient_stock`.
- **`src/modules/products/index.ts`** — `productService.syncStockCache` (to prove the ledger wins over the cache) and `productService.removeById` (soft and hard delete paths).
- **`src/modules/products/tests/factories.ts`** — `createProduct` with configurable `onHand`.
- **`src/modules/users/tests/factories.ts`** — `createUser` for distinct buyer/shopper accounts.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` to satisfy the checkout precondition for the reservation test.
- **`src/modules/payments/module.ts`** — `paymentsModule` registered via `registerCheckoutModules` so `orderConfirm` can complete.

## Notes

- Every test runs with `NODE_CART_LINE_MAX = 999`; the production default is lower. The `beforeEach`/`afterEach` pair guarantees this override is scoped per-test.
- The "removed" tests rely on `resetDomainEvents()` running *before* `removeById`. Without it, the removal listener deletes the cart line and there is nothing left to flag.
- The reserved-stock test (`counts units another order holds…`) requires a full checkout: address, shipping method, payments module registration, and a successful `orderConfirm`. It is the most setup-heavy case in the file.
- The `keysOf` + regex scan is a structural guard: it catches *any* future field named like a stock count, not just the known `availability` field.
