---
source: src/modules/cart/tests/integration/checkout-version.test.ts
source_sha256: f3c4bc8935b27c91f35daa6d2292fb07cf36812c95a630dc43ef6c47c28147aa
context_sha256: 12b6f5903c82f4a4389a2c5017b62b7a4429eaa516c47eb6c811676b106c94f8
generated_at: 2026-11-22T04:39:12.677836+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/checkout-version.test.ts

## Purpose
Integration tests, run against a real Mongo database, that pin down the cart's `__v` versioning contract. Every shopper write that changes a cart must bump `__v`, because checkout reads `__v` once and later empties the cart only if it is unchanged (`clearLinesIfUnchanged`). A write that skipped the bump would be invisible to that guard, and a line added or removed mid-checkout could be silently dropped. A mock can't show this, since the guarantee comes from the driver's own `$inc`.

## Key elements
- `setupTestDb()`: called at module level to set up the test database.
- `versionOf(userId)`: helper that returns the persisted `__v` of a user's cart, or `undefined` if no cart exists.
- `describe('cart version increments on every write that changes it')`: covers each write path through `cartService`:
  - The creating write already yields `__v === 1`, not 0, because the first write can itself race with checkout.
  - Bumps on: pushing a new line, changing a line's quantity, `addItemById` on an existing line, `removeItemById`, `remove` (whole cart), and `productRemoveFromCartsById` (a deleted product pulled from carts).
  - The one write that must not bump is `setItemById` with the quantity the line already holds. Otherwise a repeated PUT mid-checkout would fail with `CART_CHANGED` over nothing.
- `cartWithChoice()`: helper that builds a user, a product, a cart with one line (qty 2), a `'pickup'` shipping method, and the current version.
- `describe('clearLinesIfUnchanged')`: tests `cartRepository.clearLinesIfUnchanged(userId, version)`:
  - With a matching version it empties the items and the shipping choice, and bumps `__v` by 1.
  - It returns `null` and changes nothing when the cart moved since the read.
  - A replay of the same version returns `null` (it matches at most once).
  - A cart that was emptied and refilled does not match an older version.
  - It does not touch `updatedAt`, so the cart doesn't read as recently edited by the checkout that emptied it.
  - It returns `null` and creates no cart for a user with none.

## Relationships
- `@modules/cart/services` (`cartService`): the write paths under test (`setItemById`, `addItemById`, `removeItemById`, `remove`, `productRemoveFromCartsById`).
- `@modules/cart/repository` (`cartRepository`): used for `findByUserId`, `setShippingMethod`, `clearLines` and the guarded `clearLinesIfUnchanged`.
- `@modules/users/tests/factories` (`createUser`) and `@modules/products/tests/factories` (`createProduct`): create fixtures.
- `@tests/setup-test-db`: provides the real Mongo lifecycle.
- `@tests/callers` (`testCallerContext`): supplies the caller context for remove operations.
- `@tests/clock` (`freezeDate`, `advanceDate`): control time in the `updatedAt` test.

## Notes
- The `clearLinesIfUnchanged` suite has an `afterEach` that calls `jest.useRealTimers()`, so a failed assertion doesn't leave `Date` frozen.
- Several tests compute the expected version as `(before ?? 0) + 1`, so they assert a relative bump rather than an absolute value. Only the cart-creation test asserts an absolute `1`.
