---
source: src/modules/cart/tests/integration/stock-flag.test.ts
sha256: a7bc1448a106188a82b6d6bfbfc10c04ce43fad69f4d15cc5886e3e54c23cc80
generated_at: 2026-11-08T05:23:18.321476+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/stock-flag.test.ts

## Purpose

Integration tests for the `availability` field on every cart line returned by `GET /cart` and `POST /cart/merge`. Two invariants are verified: (1) the flag name (`in_stock`, `insufficient_stock`, `out_of_stock`, `removed`) correctly tracks the stock ledger and catalogue state, and (2) no numeric stock value or stock-named key ever appears in any cart response body.

## Key elements

- **`flagOf(userId)`** — shorthand that calls `cartService.getForView` and returns the `availability` of the first item.
- **`keysOf(value)`** — recursively collects every object key from a nested JSON value (objects and arrays), used to scan for stock-like field names.
- **`shortCartBody(onHand, bearer)`** — creates a product at a given `onHand`, adds 999 units to the cart via the HTTP API, and returns both the `GET /cart` and `POST /cart/merge` response bodies.
- **`anonymised(body, id)`** — deep-copies a JSON body and replaces a product-id string with a constant so two different products' responses can be structurally compared.
- **`describe('GET /cart's line availability')`** — eight cases covering: line fits / no longer fits; ledger vs. catalogue cache; line equal to available; sold-out; units held by an open order (reserved); product removed (soft and hard delete) in the pre-cleanup window; multiple lines flagged independently.
- **`describe('the availability never carries a number')`** — two cases: responses for `onHand = 1` and `onHand = 500` are byte-identical after ID anonymisation; a regex scan of every key in both bodies finds no stock-like name.
- **`beforeEach` / `afterEach`** — sets `NODE_CART_LINE_MAX` to `'999'` (the contract ceiling) so the 999-unit test lines are accepted; resets overrides after each test.

## Relationships

- **`src/modules/cart/services/index.ts`** — primary system under test: `cartService.addItemById`, `getForView`, `orderConfirm`.
- **`src/modules/cart/repository.ts`** — `cartRepository.setShippingMethod` used before the order-confirm step in the reserved-stock case.
- **`src/modules/inventory/index.ts`** — `inventoryService.adjust` to move stock down and trigger the `insufficient_stock` transition.
- **`src/modules/products/index.ts`** — `productService.syncStockCache` (ledger-vs-cache test) and `productService.removeById` (removed-flag tests).
- **`src/modules/payments/module.ts`** — registered via `registerCheckoutModules` so the order-confirm call succeeds in the reserved-units test.
- **`src/kernel/events.ts`** — `resetDomainEvents` disables the product-removal listener so the cart line survives long enough to be flagged `removed`.
- **`src/infrastructure/config/store.ts`** — `overrideEnvironment` / `resetEnvironmentOverrides` to raise `NODE_CART_LINE_MAX`.
- **`tests/support/callers.ts`** — `testCallerContext` supplied to service and inventory calls.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires the payments module into the checkout pipeline.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` required before `orderConfirm`.
- **`src/modules/users/tests/factories.ts`** — `createUser` for buyer/shopper accounts.
- **`src/modules/products/tests/factories.ts`** — `createProduct` with configurable `onHand`.

## Notes

- **`NODE_CART_LINE_MAX` override is load-bearing.** Without it the shop's own (lower) default rejects the 999-unit lines the second describe block depends on. The `afterEach` reset prevents leakage into other test files.
- **`resetDomainEvents()` is intentional, not a cleanup shortcut.** In the two "removed" cases it creates the window *before* the removal listener pulls the line out of every cart; the test asserts the flag in that window.
- **The second describe block enforces an authorization boundary** (see `docs/theory/defences/authorization.md`): only `read:StockLevel` may see exact numbers. The `keysOf` + regex scan is a structural proof that no cart field name hints at a quantity.
- **`anonymised` uses `String.replaceAll` on serialised JSON**, so any occurrence of the id string (not just the top-level `_id` field) is blanked, making the comparison robust to id references in nested payloads.
