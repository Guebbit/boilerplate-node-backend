---
source: src/modules/cart/tests/integration/backorder.test.ts
source_sha256: fe74d53da0951ccecdd2d3cf43b4980dfc9c4e85ed423f551fd856939d380fa1
context_sha256: 5e43cbc2571785ea82187037f46df26a2668d57c56eaea6b2a0ef19ed7673d3c
generated_at: 2026-11-22T04:37:51.895998+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/backorder.test.ts

## Purpose
Integration tests for how the cart handles backorders. They cover the availability a cart line reports (`in_stock`, `backorder`, `insufficient_stock`, `out_of_stock`) and what checkout does for a backorder line. At checkout it takes the available shelf units and claims the remainder against the backorder cap. The order then freezes the owed quantity and the promised date.

## Key elements
- `setupTestDb()` / `beforeEach`: set up the test DB, reset domain events, and register the payments module as the checkout module.
- `DAY_MS`: one day in milliseconds, used for restock and promise dates.
- `backorderProduct(onHand, limit, restockInDays?)`: creates a product with `allowBackorder: true` and an optional restock date, then sets the cap via `inventoryService.setBackorderLimit` (on the level, not the product).
- `availabilityOf(userId)`: returns the availability of the first line from `cartService.getForView`.
- `shopperWith(productId, quantity)`: creates a user with an address, adds the item to the cart, and sets the shipping method to `pickup`.
- `describe('a backorder line')`: checks the four availability states.
- `describe('checking out a backorder')`: checks `cartService.orderConfirm`:
  - Splits the line into shelf units and `backorderedQuantity`, with `promisedAt` and `promiseDated` frozen. Inventory levels show `reserved`, `available` and `backordered`.
  - With no restock date, promises 30 days from the order and sets `promiseDated` to false.
  - `toJSON` serializes `promisedAt` as a `YYYY-MM-DD` shop day, including for the 30-day default.
  - Leaves `backorderedQuantity` and `promisedAt` undefined when the shelf covers the line.
  - Rejects with status 409 when shelf plus cap can't cover the order, and reserves nothing.

## Relationships
- `cartService` (`../../services`) and `cartRepository` (`../../repository`): the code under test. The repository is used directly to set the shipping method.
- `inventoryService` (`@modules/inventory`): sets backorder limits and lists levels to assert reservations.
- `shopDayOf` (`@modules/shop`): computes the expected wire-format promise day.
- `paymentsModule`, `registerCheckoutModules` (`@tests/checkout-modules`): wire up checkout.
- `resetDomainEvents` (`@kernel/events`): clears event state between tests.
- `setupTestDb`, `testCallerContext` (`@tests/*`), and the user, product and address factories: provide the fixtures.

## Notes
- The test expecting a 30-day default checks a window: at least `before + 30 days` and under `now + 30 days + 1s`.
- The wire-shape test casts the `toJSON()` result to read `items[].promisedAt`.
