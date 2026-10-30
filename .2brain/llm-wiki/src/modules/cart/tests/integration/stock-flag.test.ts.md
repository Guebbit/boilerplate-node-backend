---
source: src/modules/cart/tests/integration/stock-flag.test.ts
sha256: a7bc1448a106188a82b6d6bfbfc10c04ce43fad69f4d15cc5886e3e54c23cc80
generated_at: 2026-10-29T03:30:02.625270+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/stock-flag.test.ts

## Purpose

Integration tests for the `availability` field on cart line items. They verify two invariants: (1) the field is the correct named enum (`in_stock`, `insufficient_stock`, `out_of_stock`, `removed`) for each stock/reserved/visibility scenario, and (2) the value is always a name — never a numeric stock count — so no cart response leaks a shelf number beyond the single enum token.

## Key elements

- **`flagOf(userId)`** — convenience that calls `cartService.getForView` and returns the first item's `availability`.
- **`keysOf(value)`** — recursively collects every key in a nested JSON structure; used to scan responses for stock-like field names.
- **`shortCartBody(onHand, bearer)`** — creates a product at a given stock level, adds 999 units to the cart via `POST /cart/items`, then fetches both `GET /cart` and `POST /cart/merge` bodies for comparison.
- **`anonymised(body, id)`** — replaces a product ID with a placeholder so two responses (different stock levels) can be compared structurally.
- **`describe('GET /cart's line availability')`** — seven cases covering: in-stock vs. insufficient-stock transition, ledger-vs-cache priority, boundary equality, sold-out, held-units (reserved by another open order), soft-removed, hard-deleted, and per-line independence.
- **`describe('the availability never carries a number')`** — two cases: (a) the view and merge bodies are structurally identical regardless of actual stock (1 vs 500), (b) no key matching `/available|onhand|reserved|remaining|left|stock/i` appears anywhere in either response.

## Relationships

- **`src/modules/cart/services/index.ts`** (`cartService`) — primary subject under test: `addItemById`, `getForView`, `orderConfirm`.
- **`src/modules/cart/repository.ts`** (`cartRepository`) — `setShippingMethod` called in the held-units test to prepare an order for confirmation.
- **`src/modules/inventory/index.ts` / `services/index.ts`** (`inventoryService`) — `adjust` used to reduce stock and trigger the in_stock → insufficient_stock transition.
- **`src/modules/products/index.ts` / `services/index.ts`** (`productService`) — `syncStockCache` (cache-vs-ledger test) and `removeById` (soft/hard delete tests).
- **`src/modules/payments/module.ts`** — registered via `registerCheckoutModules` so `orderConfirm` succeeds in the held-units test.
- **`src/infrastructure/config/store.ts`** — `overrideEnvironment` / `resetEnvironmentOverrides` to pin `NODE_CART_LINE_MAX` to 999 for the duration of each test.
- **`src/kernel/events.ts`** — `resetDomainEvents` suppresses the product-removal listener that would otherwise pull the line out of the cart before the assertion.
- **`src/modules/products/tests/factories.ts`** (`createProduct`) — creates products with a controllable `onHand` count.
- **`src/modules/users/tests/factories.ts`** (`createUser`) — creates the buyer/shopper identities.
- **`src/modules/addresses/tests/factories.ts`** (`giveAddress`) — satisfies the checkout prerequisite in the held-units test.
- **`tests/support/callers.ts`** (`testCallerContext`) — the caller context passed to service methods.
- **`tests/support/checkout-modules.ts`** (`registerCheckoutModules`) — wires the payments module into the checkout pipeline.

## Notes

- `NODE_CART_LINE_MAX` is overridden to `'999'` in `beforeEach` so a single line can hold up to the contract ceiling; the "no number" tests deliberately push 999 units to stress the boundary.
- `resetDomainEvents()` is called before `productService.removeById` in the removed-product tests. Without it the real removal listener would pull the line out of the cart, leaving nothing to assert. The tests specifically cover the *window before* that cleanup fires.
- The "no number" comparison uses `anonymised` to blank the product ID before `toEqual`, since two products will have different IDs.
- The held-units test (5 of 8) is the only one that exercises a full checkout (`orderConfirm`) to create a reserved allocation, making it the most dependent test in the file (payments module, address, shipping method, domain events).
