---
source: src/modules/addresses/tests/integration/checkout.test.ts
source_sha256: d0e7eedafa8ae6e3d89b0952e0189075542a8a382fea0b7d78f8b225e799264d
context_sha256: a31085702872ddf52b7e431729198f6d81cf105e8bd7cb314b3494613c6d2731
generated_at: 2026-11-22T04:16:35.964089+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/tests/integration/checkout.test.ts

## Purpose
Integration tests for how the address book interacts with checkout. They cover how `cartService.orderConfirm` resolves the shipping and billing addresses, and what the resulting order snapshots. The file is kept apart from the rest of the address-book suite because it needs a cart and an order. Removing the shop module means deleting this file along with it.

## Key elements
- `setupTestDb()`: called at module level to set up the test database.
- `cartWith(userId)`: local helper that creates an in-stock product and adds one unit to the user's cart. It returns the product.
- `describe('checkout and the address')`: tests for shipping-address resolution:
  - With no id given, the default address is snapshotted.
  - A named entry takes precedence over the default.
  - A stale id, or another user's real entry id, is refused with 404 `CART_ADDRESS_NOT_FOUND`. Stock counters (`onHand` 10, `reserved` 0), the cart and the order count are left unchanged.
  - A `pickup` order has no shipping address but is billed to the default.
  - An empty address book is refused with 422 `CART_BILLING_ADDRESS_REQUIRED`.
- `describe('checkout and the billing address')`:
  - By default, billing is the same as shipping.
  - A named `billingAddressId` is used independently of shipping.
  - A digital-only basket (`requiresShipping: false`) freezes only a billing address. It uses the default or the named entry, and returns 422 if no address exists.
  - Passing a shipping `addressId` on a digital-only basket returns 409 `CART_ADDRESS_NOT_APPLICABLE`.
  - Another user's entry as billing is refused with 404, the same as for shipping.
  - A case asserting the billing address is not held to the ship-to countries uses a `JP` address. The rest of that case is not shown.

## Relationships
- `src/modules/addresses/service.ts`: provides `addressService` (`create`, `list`), used to seed and look up address entries.
- `src/modules/addresses/tests/integration/fixtures.ts`: supplies the `HOME` ("Via Roma 1", Ada Lovelace) and `OFFICE` ("Via Milano 2") address fixtures.
- `src/modules/cart/index.ts` / `src/modules/cart/services/index.ts`: `cartService` supplies `addItemById`, `setShippingMethod`, `orderConfirm` and `getForBadge`. This is the code under test.
- `src/modules/products/tests/factories.ts`: `createProduct` and `countersOf` for building products and reading stock counters.
- `src/modules/orders/tests/factories.ts`: `countOrders`, used to assert that no order was created on refusal.
- `src/modules/users/tests/factories.ts`: `createUser`.
- `tests/support/callers.ts`: `testCallerContext`, passed to `orderConfirm`.
- `tests/support/setup-test-db.ts`: `setupTestDb`.

## Notes
- Address checks run before any stock is held, so refused checkouts leave the product counters and the cart untouched.
- A stranger's real address id and an invented id produce the same 404 result. The test comment says the intent is to prove ownership, not just existence, and that the resolver's split return type exists for this case. The comment says collapsing it would let a foreign id silently downgrade to "no address".
- `orderConfirm`'s third argument is optional. It takes `{ addressId?, billingAddressId? }`, and `undefined` or omitting it means "use the default".
- Tests that need a second user pass explicit `email` and `username` values to `createUser`.
