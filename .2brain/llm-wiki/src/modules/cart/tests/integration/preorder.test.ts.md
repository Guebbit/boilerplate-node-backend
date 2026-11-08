---
source: src/modules/cart/tests/integration/preorder.test.ts
sha256: ab35cec088b0e483d12c161617020d87c08a7c86516ad9ff9b540202e5ce3422
generated_at: 2026-11-08T05:21:55.649958+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/preorder.test.ts

## Purpose

Integration tests that verify the cart's preorder path end-to-end: how a preorder line's availability is computed (against the backorder allowance, not shelf stock), how checkout claims the allowance while leaving the shelf untouched, how the preorder promise is frozen onto the order line, and how a basket can mix preorder and in-stock goods in a single order.

## Key elements

- **`nextMonth()`** – Returns an ISO string 30 days out; used as the product's `releaseDate`.
- **`preorderProduct(limit, onHand)`** – Creates a product with a future release date, then sets its backorder limit via `inventoryService.setBackorderLimit`. Defaults to 0 shelf stock.
- **`availabilityOf(userId)`** – Fetches the first cart line's `availability` field via `cartService.getForView`.
- **`shopperWith(productId, quantity, email?)`** – Sets up a user (with address), adds the item to their cart, and sets shipping to `'pickup'` — the minimum state for `orderConfirm`.
- **`describe('a preorder line')`** – Four availability-reading cases: `preorder`, `insufficient_stock`, `out_of_stock` (no allowance regardless of shelf), and `in_stock` once the release date has passed.
- **`describe('checking out a preorder')`** – Four checkout cases: allowance claimed + promise frozen + shelf unchanged; 409 rejection when allowance is exhausted; mixed basket (preorder + in-stock) succeeds with correct per-line flags; frozen promise survives a later release-date change.

## Relationships

- **`src/kernel/events.ts`** – `resetDomainEvents()` in `beforeEach` clears the in-memory event bus between tests.
- **`src/modules/cart/services/index.ts`** – `cartService` provides `addItemById`, `getForView`, and `orderConfirm` under test.
- **`src/modules/cart/repository.ts`** – `cartRepository.setShippingMethod` sets `'pickup'` directly (bypassing the service layer) to satisfy checkout preconditions.
- **`src/modules/inventory/index.ts`** – `inventoryService` is used to set backorder limits, inspect `listPreorders()` levels, and read shelf stock via `availableFor`.
- **`src/modules/products/index.ts`** – `productService.updateById` is called to push a release date into the past (simulating time passing).
- **`src/modules/products/tests/factories.ts`** – `createProduct` builds the catalogue row with `onHand` and `releaseDate`.
- **`src/modules/addresses/tests/factories.ts`** – `giveAddress` attaches the required shipping address to a user.
- **`src/modules/users/tests/factories.ts`** – `createUser` provisions the buyer identity.
- **`src/modules/payments/module.ts`** – `paymentsModule` is registered (via `registerCheckoutModules`) so `orderConfirm` can complete the payment step.
- **`src/modules/shop/index.ts`** – `shopDayOf` converts a `Date` into the shop's day-of format used when back-dating `releaseDate`.
- **`tests/support/callers.ts`** – `testCallerContext` supplies the authenticated caller context for service calls.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules` wires the payments module into the checkout pipeline.

## Notes

- `setupTestDb()` is invoked once at module scope (not in `beforeEach`); `resetDomainEvents()` and `registerCheckoutModules` run per test.
- Preorder availability is deliberately judged against the **allowance** (backorder limit), not `onHand` shelf stock. The "out_of_stock with no allowance, however full the shelf is" test makes this contract explicit.
- The frozen-promise test (`keeps the promise frozen when the date later passes`) confirms that once an order is confirmed, the `preorder: true` flag and `releaseDate` on the order line are immutable even if the product's release date is subsequently moved to the past.
- The 409 rejection test uses a **different email** for the latecomer to ensure a distinct user/session, and asserts the error `code` is `CART_INSUFFICIENT_STOCK` with per-line details.
