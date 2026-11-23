---
source: src/modules/cart/tests/integration/preorder.test.ts
source_sha256: 212fee866b0f06886d80284d95f74847c1cb2d46fe66e023b9e954a18ee617a8
context_sha256: 7e51b0717d73c338ae1479eed7a9a8ed3c96bf0f8c31ddebbd437d2884070138
generated_at: 2026-11-22T04:41:05.506675+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/preorder.test.ts

## Purpose
Integration tests for how the cart treats a preorder product. They cover the availability a cart line reports (`preorder`, `insufficient_stock`, `out_of_stock`, `in_stock`) and what checkout does with a preorder: it claims the backorder allowance, leaves the shelf alone, freezes the preorder promise on the order line, and accepts a basket that mixes a preorder with ordinary goods.

## Key elements
- `setupTestDb()` and a `beforeEach` that calls `resetDomainEvents()` and `registerCheckoutModules([paymentsModule])`.
- `nextMonth()`: an ISO release date 30 days ahead.
- `preorderProduct(limit, onHand = 0)`: creates a product with a future `releaseDate` and sets its backorder limit through `inventoryService.setBackorderLimit`.
- `availabilityOf(userId)`: reads `cartService.getForView(...)` and returns the availability of the first line.
- `shopperWith(productId, quantity, email?)`: creates a user with an address and the product in their cart, and sets the shipping method to `pickup` through `cartRepository.setShippingMethod`.
- `describe('a preorder line')`:
  - Reads `preorder` while the allowance covers the quantity.
  - Reads `insufficient_stock` when the quantity exceeds the allowance left.
  - Reads `out_of_stock` with a zero allowance, even if the shelf holds 50.
  - Returns to `in_stock` (shelf-based) once the release date is in the past.
- `describe('checking out a preorder')`:
  - Checkout succeeds. `inventoryService.listPreorders()` then shows `backordered: 2, held: 2, paid: 0, left: 3`. Shelf availability stays 0. The order line has `product.preorder: true` and the product's `releaseDate`.
  - Once the allowance is full, a later shopper gets status 409 with `CART_INSUFFICIENT_STOCK` and the line `availability: 'out_of_stock'`.
  - A mixed basket succeeds. The preorder line is flagged `true` and the ordinary line's `preorder` is `undefined`. The ordinary product's shelf availability drops from 4 to 2.
  - The order line still says `preorder: true` after the release date is moved into the past.

## Relationships
- `cartService` (`../../services`) is the subject under test: `addItemById`, `getForView` and `orderConfirm`.
- `cartRepository` is used only to set the shipping method to `pickup`.
- `inventoryService` (`@modules/inventory`) sets backorder limits and checks `listPreorders` and `availableFor`.
- `productService` (`@modules/products`) updates `releaseDate` to simulate the date passing.
- `shopDayOf` (`@modules/shop`) formats the past release date.
- `createProduct`, `createUser` and `giveAddress` come from the products, users and addresses test factories.
- `testCallerContext` (`@tests/callers`), `registerCheckoutModules` (`@tests/checkout-modules`) and `setupTestDb` (`@tests/setup-test-db`) supply the test support. `paymentsModule` is registered as the only checkout module.
- `resetDomainEvents` (`@kernel/events`) clears domain events between tests.

## Notes
- Preorder status is set by giving the product a future `releaseDate` and a backorder limit.
- When a preorder is judged, the allowance counts and the shelf (`onHand`) does not.
- The release date is written two ways: `nextMonth()` produces an ISO string, and `shopDayOf(...)` produces the value for `productService.updateById`.
- The refusal test uses a second shopper with a fixed email (`latecomer@example.com`) so the two users don't collide.
