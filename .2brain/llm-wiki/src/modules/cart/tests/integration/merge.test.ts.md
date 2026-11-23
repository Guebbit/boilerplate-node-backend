---
source: src/modules/cart/tests/integration/merge.test.ts
source_sha256: bb389ca9d29a16084a1c40897c2174ff21a527bbd30cd97a5e6e59ae20e328be
context_sha256: 77d892ac09e70ad672a51291a3d08e7641ec238503c35018cd1ec367736b27b5
generated_at: 2026-11-22T04:40:48.063561+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/merge.test.ts

## Purpose
Integration tests for `cartService.merge`, which folds a guest cart into a signed-in user's cart. The tests pin down the rule that mirrors `POST /cart` applied line by line. Quantities add up, and lines that can't be added as asked are answered with a reason instead of failing. One bad line never blocks the others. Stock only flags a line and never changes its quantity. The file also covers what is announced for lines that could not be added at all, which is the contract with `notifications`. Every case reads the cart back to check what it actually holds.

## Key elements
- `setupTestDb()`: sets up the test database.
- `beforeEach` / `afterEach` (top level): override `NODE_CART_LINE_MAX_QUANTITY` to `'999'` so lines can reach the contract's ceiling, then reset the overrides.
- `quantities(userId)`: reads the cart through `cartService.get` and returns `productId → quantity`.
- `lineOf(product, quantity)`: builds a guest line `{ productId, quantity }` from a product document.
- `announced`: a `jest.fn()` subscribed to `CART_MERGE_REFUSED` through `onDomainEvent`. Domain events are reset before each case in `describe('merge')`.
- `describe('answers one result per submitted line')`: checks the per-line result shape `{ productId, requested, resulting, reason?, availability }`.
  - A new product has no reason.
  - A product in both carts is `summed`.
  - A line stopped at 999 is `capped`.
  - Results keep request order, and a removed product gets reason and availability `removed`.
  - A product listed twice gives two results, the second seeing the first.
  - The merged `cart` is also returned.
- `describe('stock flags a line and never changes it')`: covers these cases.
  - A short line is added in full with availability `insufficient_stock` and no reason.
  - A line that exactly fits stays `in_stock`.
  - A summed quantity is counted against stock, and the sum is kept.
  - A line already above stock is never lowered.
  - A sold-out product is added and flagged `out_of_stock`, not `removed`.
  - A capped line that is also short keeps the `capped` reason and is flagged `insufficient_stock`.
  - A hold from another shopper's checkout is counted. This case is cut off in the visible content.

## Relationships
- `src/modules/cart/services/index.ts`: supplies `cartService`, the unit under test (`merge`, `get`, `addItemById`).
- `src/modules/cart/repository.ts`: `cartRepository`, used to set up state directly (for example `setShippingMethod` in the checkout-hold case).
- `src/modules/cart/events.ts`: exports `CART_MERGE_REFUSED`, the event the tests listen for.
- `src/kernel/events.ts`: provides `onDomainEvent` and `resetDomainEvents` for capturing and isolating events.
- `src/infrastructure/config/store.ts`: provides `overrideEnvironment` and `resetEnvironmentOverrides` for the line-quantity cap.
- `src/modules/products/tests/factories.ts`, `src/modules/users/tests/factories.ts`, `src/modules/addresses/tests/factories.ts`: provide `createProduct` (with an `onHand` option), `createUser` and `giveAddress` as fixtures.
- `src/modules/products/index.ts`: the products service is used to make a product removed.
- `src/modules/inventory/index.ts`: the inventory service is used to change stock through the ledger the merge reads.
- `src/modules/payments/module.ts`: imported as `paymentsModule`, together with `registerCheckoutModules` from `@tests/checkout-modules`. They are most likely for the checkout-hold case, but their use is not visible in the shown portion.
- `tests/support/callers.ts`: provides `testCallerContext`, passed to `merge`.

## Notes
- Stock never alters a merged quantity. It only sets `availability` (`in_stock`, `insufficient_stock`, `out_of_stock`, `removed`).
- `reason` is set only for `summed`, `capped` or `removed`. It is absent for plain adds and for stock-only flags.
- The 999 ceiling is above the shop's default, so tests that depend on it rely on the environment override in the top-level hooks.
