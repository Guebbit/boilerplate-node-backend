---
source: src/modules/cart/tests/integration/line-availability.test.ts
source_sha256: faae773c6cc9948b9ede41997a32725326542b202407842c63747ed5471cedfc
context_sha256: 4e97d6b5df115f801e7ad2f080c8c11c4e7785a41879b87dfb0a4470804ef80a
generated_at: 2026-11-22T04:39:35.081544+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/line-availability.test.ts

## Purpose
Integration tests for how the cart reports product state on its lines. A hidden product (`active: false`) keeps its cart line but reads `removed`. An off-sale product (`purchasable: false`) keeps its line and reads `unavailable`. Checkout refuses both, each with its own error. The module header states that nothing here removes a line; only a deletion does.

## Key elements
- `setupTestDb()` and a `beforeEach` that calls `resetDomainEvents()` and `registerCheckoutModules([paymentsModule])`.
- `availabilityOf(userId)`: returns the `availability` of the first item from `cartService.getForView`.
- `heldBy(userId)`: returns the cart's quantities as a `productId → quantity` map.
- `edit(id, data)`: calls `productService.updateById` to flip `active` or `purchasable`, as an admin edit would.
- `describe('a hidden product (active: false)')`:
  - The line is kept, reads `removed`, and returns to `in_stock` on reactivation.
  - A new add is refused with a 404, so the product is not revealed.
  - `orderConfirm` fails with `CART_PRODUCT_UNAVAILABLE` and status 409.
- `describe('an off-sale product (purchasable: false)')`:
  - An add is accepted and the line reads `unavailable`.
  - Putting the product back on sale returns the line to `in_stock`.
  - `orderConfirm` fails with `CART_INSUFFICIENT_STOCK` and status 409. The error `details.lines` carries `productId`, `title`, `requested` and `availability: 'unavailable'`.
  - A refused checkout leaves the cart quantities unchanged, so no hold is placed.
- `describe('merge, by product state')`:
  - An off-sale product is added with `availability: 'unavailable'`, and nothing is announced.
  - A hidden product is not added. Its merge line has `resulting: 0`, `reason: 'removed'` and `availability: 'removed'`, and `CART_MERGE_REFUSED` is announced once.

## Relationships
- Under test:
  - `cartService` (`../../services`) provides `getForView`, `addItemById`, `orderConfirm` and `merge`.
  - `cartRepository` (`../../repository`) is used to set the shipping method to `'pickup'` before checkout.
  - `productService` (`@modules/products`) performs the flag edits.
- `CART_MERGE_REFUSED` (`../../events`) and `onDomainEvent` / `resetDomainEvents` (`@kernel/events`) are used to spy on and reset the merge-refusal event.
- Test data comes from the `createUser`, `createProduct` and `giveAddress` factories in the users, products and addresses `tests/factories` files.
- `tests/support` helpers supply the DB setup (`setup-test-db`), `testCallerContext` (`callers`) and `registerCheckoutModules` (`checkout-modules`).
- `paymentsModule` is registered so checkout can run.

## Notes
- Checkout pre-flight and write-side refusals are expected to return the same 409 for a hidden product.
- A hidden product reads as a missing product (404 on add, `CART_PRODUCT_UNAVAILABLE` at checkout). An off-sale product reads as a stock problem (`CART_INSUFFICIENT_STOCK`).
- The module header references a `line-availability` section of the cart module docs as the spec.
