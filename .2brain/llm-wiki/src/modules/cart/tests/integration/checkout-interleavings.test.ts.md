---
source: src/modules/cart/tests/integration/checkout-interleavings.test.ts
source_sha256: 4d7e5718bbaad614dabcb51225b9b0ec0ee8244b8c45fc104efc89b14a572e31
context_sha256: efdeb54b2277c9f63abd4266b9c7b73f5d2fee51cece04f45de663dea8b8d5e1
generated_at: 2026-11-22T04:38:19.914369+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/checkout-interleavings.test.ts

## Purpose
Integration tests that make a cart write land at a fixed point in the middle of `cartService.orderConfirm`: after the cart's version was read, while its lines are being joined to products. This gives a deterministic interleaving on every run. It complements `cart-races.test.ts`, which fires N identical checkouts and relies on the scheduler to overlap them. It also complements `stock.test.ts`, which stubs `clearLinesIfUnchanged` to `null`.

## Key elements
- `shopperWithCart()`: creates a user with an address, two products (`onHand: 10`), a cart holding 3 of the first product, and the `pickup` shipping method.
- `writeDuringJoin(write)`: spies once on `productService.findManyByIds`. After the real lookup resolves, it runs `write()` before returning the products. This is the injection point.
- `levelOf(productId)`: reads `onHand` and `reserved` directly from the `stocklevels` collection through `stockLevelRepository`.
- `cartSnapshot(userId)`: returns the cart's items, `shippingMethodId` and `__v` as plain data for comparison.
- `CartWrite` / `CART_WRITES`: a table of five racing writes:
  - adding another product
  - raising a quantity
  - removing the line
  - clearing the cart
  - changing the shipping method to `null`
- Test groups:
  - **A cart write between the version read and the clear**
    - For each write in `CART_WRITES`, the checkout must return `success: false`, status 409 and code `CART_CHANGED`.
    - It must leave no order, no hold (`onHand` 10, `reserved` 0) and no moved counters.
    - It must leave the shopper's newer cart exactly as the write left it.
    - A retry after a lost checkout succeeds. It orders the cart as it stands after the write and holds 3 and 2 units.
    - A write that changes nothing (setting the quantity the line already has) does not cause a false `CART_CHANGED`, because there is no `__v` bump.
  - **A reprice between the catalogue read and the order write**
    - The product is repriced from 40.00 to 10.00 mid-join.
    - The order must still carry the 40.00 line price and `shippingCost` of `'0.00'` (free shipping on standard above 100).
    - The payment intent amount must be `'120.00'`, so there is no half-applied reprice.

## Relationships
- **`cartService`** (`../../services`): the system under test. The file calls `addItemById`, `setItemById`, `removeItemById`, `remove` and `orderConfirm`.
- **`cartRepository`** (`../../repository`): used for `setShippingMethod` and `findByUserId`.
- **`productService`** (`@modules/products`): its `findManyByIds` is the spied injection point.
- **`paymentService`** (`@modules/payments`): `createIntent` is used to check the intent amount after a reprice.
- **Factories** (`products`, `users`, `addresses`, `orders`, `inventory` `tests/factories`): provide `createProduct`, `readProduct`, `saveProduct`, `countersOf`, `createUser`, `giveAddress`, `countOrders` and `stockLevelRepository`.
- **`@kernel/events`**: `resetDomainEvents` runs before each test.
- **`tests/support/*`**: `registerCheckoutModules` wires the checkout modules, `setupTestDb` sets up the database, and `asCustomer` and `testCallerContext` supply caller contexts.

## Notes
- Spying on `productService.findManyByIds` is safe because it is an own method of a plain object, which keeps it compatible with the swc mutation harness.
- The spy uses `mockImplementationOnce`, so only the next checkout is interrupted. `jest.restoreAllMocks()` runs in `afterEach`.
- The 409 loser's cart is compared against a snapshot taken right after the write, not against the original cart.
