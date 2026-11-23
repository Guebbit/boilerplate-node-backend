---
source: src/modules/cart/tests/integration/stock-flag.test.ts
source_sha256: 8183e503510f05018e2e8b613192665757921dd9d19c9c8d843b08dd21ec66d8
context_sha256: c1a326d830752dd15b32c8291bbacb60251cc92ab9d7c3d28f5ce5e24ca8f85b
generated_at: 2026-11-22T04:42:02.872610+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/stock-flag.test.ts

## Purpose
Integration tests for the per-line `availability` flag in the cart view. They check that every cart answer labels each line with a name (`in_stock`, `insufficient_stock`, `out_of_stock`, `removed`), using the same rule as checkout and the merge. They also check that the flag is only a name and never exposes the number of units left, because exact stock is reserved for `read:StockLevel`.

## Key elements
- `beforeEach` / `afterEach` — set `NODE_CART_LINE_MAX_QUANTITY` to `'999'` through `overrideEnvironment`, then reset it. The tests need lines up to the contract's 999 ceiling, above the shop's lower default.
- `flagOf(userId)` — calls `cartService.getForView` and returns the `availability` of the first item.
- `keysOf(value)` — recursively collects every key in a JSON value, including nested objects and arrays.
- `shortCartBody(onHand, bearer)` — creates a product at `onHand`, adds 999 of it to the caller's cart through `POST /cart/items`, then fetches `GET /cart` and `POST /cart/merge`. It returns the product id and both response bodies.
- `anonymised(body, id)` — replaces the product id with `PRODUCT` so responses for different products can be compared.
- `describe('GET /cart’s line availability')` — service-level cases:
  - `in_stock` while the line fits, and `insufficient_stock` after `inventoryService.adjust` reduces stock.
  - A line equal to the quantity for sale counts as fitting.
  - `out_of_stock` when `onHand` is 0.
  - Units held by another confirmed order count as not for sale (10 on the shelf, 6 held: 4 fit, 5 do not).
  - `removed` for a soft-removed product and for a hard-deleted one, in the window before the cart cleanup runs.
  - Each line in one answer is flagged independently.
- `describe('the availability never carries a number')` — HTTP-level cases:
  - `GET /cart` and `POST /cart/merge` return identical bodies, apart from the product id, for 1 unit on the shelf and for 500.
  - No key in either response matches `/available|onhand|reserved|remaining|left|stock/i`.

## Relationships
- `cartService` (`../../services`) — supplies `getForView`, `addItemById` and `orderConfirm`.
- `cartRepository` (`../../repository`) — `setShippingMethod` prepares the order-confirm case.
- `inventoryService` (`@modules/inventory`) — `adjust` changes stock.
- `productService` (`@modules/products`) — `removeById` soft- or hard-removes a product.
- `@modules/payments/module` — passed to `registerCheckoutModules` from `tests/support/checkout-modules.ts` so `orderConfirm` can run.
- `resetDomainEvents` (`@kernel/events`) — clears listeners.
- `overrideEnvironment` / `resetEnvironmentOverrides` (`@infrastructure/config/store`) — set and reset the quantity ceiling.
- Test support:
  - `testCallerContext` from `tests/support/callers.ts`.
  - The product, user and address factories (`createProduct`, `createUser`, `giveAddress`).
  - `setupTestDb`, `api`, `authenticateAs` and `authenticateAsRole`, imported through the `@tests/...` aliases.

## Notes
- `resetDomainEvents()` is called on purpose in the `removed` tests. Without it, the real removal event would pull the line out of every cart and leave nothing to flag.
- In the order-hold case, `resetDomainEvents()` runs before `registerCheckoutModules([paymentsModule])`, so only the payments module is wired up when the order is confirmed.
- The comparison test authenticates as two different roles (`user` and `customer`) so that each product gets its own cart.
