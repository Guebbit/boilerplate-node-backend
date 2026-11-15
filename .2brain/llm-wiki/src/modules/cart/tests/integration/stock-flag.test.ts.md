---
source: src/modules/cart/tests/integration/stock-flag.test.ts
sha256: 5950e0a0e71de8022f1599b09699d39c707227dc4c43aada516298a36461ce73
generated_at: 2026-11-14T19:35:56.979880+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/stock-flag.test.ts

## Purpose

Integration tests for the cart line `availability` flag. They verify that the flag (`in_stock`, `insufficient_stock`, `out_of_stock`, `removed`) is derived from the stock ledger (not the catalogue cache), that reserved units from open orders reduce what "fits," and that the flag is always a name string—never a numeric stock count—across both `GET /cart` and `POST /cart/merge` responses.

## Key elements

- **`flagOf(userId)`** — Fetches the user's cart view via `cartService.getForView` and returns the `availability` of the first line.
- **`keysOf(value)`** — Recursively collects every key from a nested JSON structure (objects, arrays) for the no-stock-field assertion.
- **`shortCartBody(onHand, bearer)`** — Creates a product at the given stock level, adds 999 units to the caller's cart, then returns both the `GET /cart` and `POST /cart/merge` response bodies.
- **`anonymised(body, id)`** — Deep-clones a response body and replaces the product ID with a placeholder so two responses at different stock levels can be compared structurally.
- **`describe("GET /cart's line availability")`** — Eight tests covering: in-stock vs. insufficient, ledger-over-cache precedence, boundary (line == stock), sold-out, reserved-unit accounting, product-removed (soft and hard) in the pre-cleanup window, and per-line independence in a multi-line cart.
- **`describe("the availability never carries a number")`** — Two tests asserting that responses at stock 1 and stock 500 are structurally identical (after ID anonymisation) and that no key matching `/available|onhand|reserved|remaining|left|stock/i` appears anywhere in the payload.

## Relationships

- **`src/modules/cart/services/index.ts`** — The primary subject under test; this file imports `cartService` to add items, read the cart view, and confirm orders.
- **`src/modules/cart/repository.ts`** — Imports `cartRepository` to set the shipping method before order confirmation in the reserved-units test.
- **`src/modules/inventory/index.ts`** — Imports `inventoryService` to adjust stock levels and trigger the insufficient-stock flag.
- **`src/modules/inventory/services/index.ts`** — Re-exported service layer consumed through the inventory module import.
- **`src/modules/products/index.ts`** — Imports `productService` to poison the stock cache, and to soft- or hard-remove a product.
- **`src/modules/products/services/index.ts`** — Re-exported service layer consumed through the products module import.
- **`src/modules/payments/module.ts`** — Registered as a checkout module so `orderConfirm` can complete in the reserved-units test.
- **`src/kernel/events.ts`** — `resetDomainEvents` disables event listeners so product removal does not immediately strip the line from the cart (tests the pre-cleanup window).
- **`src/infrastructure/config/store.ts`** — `overrideEnvironment` / `resetEnvironmentOverrides` to raise `NODE_CART_LINE_MAX_QUANTITY` to 999 for boundary tests.
- **`tests/support/callers.ts`** — Provides `testCallerContext` (the caller identity passed to service methods).
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires the payments module into the checkout flow for the order-confirmation test.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` to satisfy the address requirement before `orderConfirm`.
- **`src/modules/users/tests/factories.ts`** — `createUser` to provision test buyers.
- **`src/modules/products/tests/factories.ts`** — `createProduct` to create products with a specific `onHand` count.

## Notes

- `NODE_CART_LINE_MAX_QUANTITY` is overridden to `'999'` in `beforeEach` because the shop's production default is lower; the tests need the contract's ceiling to exercise boundary cases. The override is reset in `afterEach`.
- `resetDomainEvents()` is intentionally called before `productService.removeById` to freeze the system in the "window before the pull"—the brief moment when the product is flagged removed but the event-driven cart cleanup has not yet executed. Without this, the line would be deleted and there would be nothing to assert.
- The "never carries a number" suite is a security invariant (referenced in `docs/theory/defences/authorization.md`): no field in a cart response may vary with exact shelf counts. The `keysOf` + regex check is the enforcement mechanism.
- The test uses both `authenticateAs('user')` and `authenticateAsRole('customer')` to confirm the invariant holds regardless of the caller's role.
