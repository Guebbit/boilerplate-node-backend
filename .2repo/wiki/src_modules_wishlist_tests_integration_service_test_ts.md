# src/modules/wishlist/tests/integration/service.test.ts

## Purpose

Integration test suite for `wishlistService` that verifies the service's core invariants against a real database: idempotent saves, public-catalogue gating, the "cart-first" ordering in move-to-cart, and event-subscription cleanup on hard-deleted products and users. It exists to catch regressions in the interplay between the wishlist, cart, and product modules that unit-level mocks would hide.

## Key elements

- **`setupTestDb()`** — called once at module scope; provisions the in-memory test database before any test runs.
- **`savedIds(userId)`** — helper that fetches the user's wishlist via `wishlistService.wishlistGet` and returns the list of `productId` strings; used in nearly every assertion.
- **`describe('wishlistAdd')`** — three cases: basic save, double-save idempotency, and 404 for a product with `active: false`.
- **`describe('wishlistRemove')`** — two cases: removing one of multiple saved lines, and 404 when the caller never saved the product.
- **`describe('wishlistMoveToCart')`** — five cases: happy-path move (cart gets item, wishlist clears), increment of an existing cart line, 404 for an unsaved product (no cart write), 404 after deactivation (line **stays** saved), and 404 after soft-deletion (no cart write).
- **`describe('the module subscriptions')`** — two cases: hard-deleted product purged from **all** users' wishlists; hard-deleted user's wishlist row removed from the repository.

## Relationships

- **`src/modules/wishlist/service.ts`** — the system under test (`wishlistAdd`, `wishlistRemove`, `wishlistMoveToCart`, `wishlistGet`).
- **`src/modules/wishlist/repository.ts`** — `findByUserId` used directly in the user-deletion assertion (bypasses the service).
- **`src/modules/cart/index.ts`** → `cartService` — `cartGetForBadge` and `cartItemAddById` used to assert post-move state and pre-populate cart lines.
- **`src/modules/products/index.ts`** → `productService` — `updateById` (deactivation) and `removeById` (soft vs. hard delete) to drive catalogue-state changes.
- **`src/modules/products/tests/factory.ts`** — `createProduct` factory with optional `{ active, title }` overrides.
- **`src/modules/users/tests/factory.ts`** — `createUser` factory.
- **`src/modules/users/index.ts`** → `userService` — `removeById(id, true)` to trigger the hard-delete subscription.
- **`src/kernel/registry.ts`** — `registerModules(enabledModules)` wires event subscriptions in the subscription `beforeEach`.
- **`src/kernel/events.ts`** — `resetDomainEvents()` clears the event bus before re-registering modules.
- **`src/modules.ts`** — `enabledModules` array passed to the registry.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()`.
- **`tests/support/caller-context.ts`** — `testCallerContext` passed as the third argument to every service call.

## Notes

- The subscription tests are the only block with a `beforeEach`; all other blocks rely on the DB being clean per-test (presumably handled by `setupTestDb`). Forgetting `resetDomainEvents()` + `registerModules()` would silently skip the product/user-deletion cleanup assertions.
- The "deactivated product" test deliberately asserts the line **remains** saved. The doc comment in the file makes the intent explicit: refusal is about purchasing, not about the user's saved list.
- Soft-delete (`removeById(id)`) does **not** trigger subscription cleanup; only hard-delete (`removeById(id, true)`) does. The suite covers both paths to pin this distinction.
- `savedIds` goes through the public service API (`wishlistGet`) rather than the repository, except in the user-deletion test where the repository is queried directly to confirm the row is physically absent.
