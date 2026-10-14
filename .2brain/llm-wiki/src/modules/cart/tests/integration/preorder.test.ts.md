---
source: src/modules/cart/tests/integration/preorder.test.ts
sha256: caffc5d289d50d4d1b4578d288c6807b48ed7d545fd806b347ea88eab00aa009
generated_at: 2026-10-14T15:17:21.150135+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/preorder.test.ts

## Purpose

Integration tests for the preorder cart flow: verifying that a line's availability is judged against the preorder allowance (not shelf stock), that checkout claims the allowance while leaving the shelf untouched and freezes the preorder promise on the order line, and that a basket may mix preorder items with ordinary in-stock goods.

## Key elements

- **`preorderProduct(limit, onHand?)`** — creates a product with a future `releaseDate` (30 days out) and sets its preorder limit via `inventoryService.setPreorderLimit`. Defaults `onHand` to 0.
- **`availabilityOf(userId)`** — reads the cart for view and returns the `availability` string on the first line.
- **`shopperWith(productId, quantity, email?)`** — creates a user, attaches an address, adds the item to the cart, and sets shipping method to `pickup`. Returns the user, ready for `orderConfirm`.
- **`describe('a preorder line')`** — four cases: availability reads `preorder`, `insufficient_stock`, `out_of_stock` (zero allowance, full shelf), and `in_stock` once the release date has passed.
- **`describe('checking out a preorder')`** — four cases: successful checkout claims allowance / freezes promise / leaves shelf at 0; 409 refusal with `CART_INSUFFICIENT_STOCK` when the allowance is exhausted; mixed basket (preorder + in-stock) succeeds with correct frozen flags and shelf decrement; promise stays frozen even after the release date later passes.
- **`nextMonth()`** — helper returning an ISO date 30 days in the future.

## Relationships

- **`../../services` (cart services barrel)** — under test: `cartGetForView`, `cartItemAddById`, `orderConfirm`.
- **`../../repository`** — `cartRepository.setShippingMethod` is called to set `pickup` before checkout.
- **`@modules/inventory`** — `inventoryService.setPreorderLimit` (setup), `listPreorders` (assert allowance levels), `availableFor` (assert shelf unaffected).
- **`@modules/products`** — `productService.updateById` to advance the release date past "now" for the in-stock transition test.
- **`@modules/products/tests/factories`** — `createProduct` with `onHand` and `releaseDate` fields.
- **`@modules/addresses/tests/factories`** — `giveAddress` to satisfy checkout's address requirement.
- **`@modules/users/tests/factories`** — `createUser` for distinct shoppers (the 409 test passes a separate email).
- **`@modules/payments/module`** — registered in `beforeEach` via `registerCheckoutModules` so `orderConfirm` has a payment provider.
- **`@kernel/events`** — `resetDomainEvents` in `beforeEach` to isolate event-bus state between tests.
- **`@tests/callers`** — `testCallerContext` passed to service calls that require a caller.
- **`@tests/checkout-modules`** — `registerCheckoutModules` to wire the payment module into the checkout pipeline per test.

## Notes

- All checkout scenarios use `pickup` as the shipping method; no delivery-based paths are exercised here.
- `beforeEach` both resets domain events **and** re-registers checkout modules, so each test gets a clean event bus and a known set of registered modules (payments only).
- "Freezing the promise" means the order line captures `product.preorder = true` and the `releaseDate` at checkout time; a later `productService.updateById` changing the date does not alter the already-confirmed line.
- The 409 test creates a *second* user with a distinct email to prove the refusal is per-order, not a cart-ownership error.
- The module docstring references `docs/modules/cart.md#line-availability` as the source-of-truth spec.
