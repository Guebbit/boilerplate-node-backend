# src/modules/wishlist/tests/integration/service.test.ts

## Purpose

Integration tests for `wishlistService` that exercise the full service layer against a real (test) database. They verify the behavioural contracts called out in the module docblock: idempotent saves, the public-catalogue gate, the "write cart before dropping the line" ordering in move-to-cart, and event-subscription cleanup on hard deletes of products and users.

## Key elements

- **`savedIds(userId)`** — local helper that calls `wishlistService.wishlistGet` and returns the array of `productId` strings; used in nearly every assertion to confirm wishlist state without importing the repository directly.
- **`describe('wishlistAdd')`** — three cases: happy-path save, double-save idempotency (`$addToSet`), and 404 rejection when the product is not publicly active.
- **`describe('wishlistRemove')`** — removes exactly the named product line; returns 404 if the line does not exist in the caller's wishlist.
- **`describe('wishlistMoveToCart')`** — six cases covering: successful move (line appears in cart, saved line gone); incrementing an existing cart line (qty 2→3); 404 for a product never saved (no cart write); 404 after the product is de-activated (line **remains saved**); 404 after soft-delete; and the catalogue gate reached *through* the cart's own refusal rather than a second product lookup.
- **`describe('the module subscriptions')`** — two cases driven by domain events: hard-delete of a product purges it from every user's wishlist; hard-delete of a user removes their wishlist document (asserted via `wishlistRepository.findByUserId` returning `null`).

## Relationships

- **`src/modules/wishlist/service.ts`** — the unit under test; every `wishlistAdd` / `wishlistRemove` / `wishlistMoveToCart` / `wishlistGet` call targets this.
- **`src/modules/wishlist/repository.ts`** — imported directly in the subscriptions block to assert document-level cleanup (`findByUserId` → `null`).
- **`src/modules/cart/index.ts`** (`cartService`) — called in move-to-cart tests both to verify the resulting cart state (`cartGetForBadge`) and to seed a pre-existing cart line before the move.
- **`src/modules/products/index.ts`** (`productService`) — used to de-activate (`updateById`) or delete (`removeById`) a product mid-test to trigger the catalogue gate or the event subscription.
- **`src/modules/users/index.ts`** (`userService`) — used to hard-delete a user in the subscriptions block.
- **`src/modules/products/tests/fixtures.ts`** (`createProduct`) — fixture that creates a product with optional overrides (e.g. `{ active: false }`).
- **`src/modules/users/tests/fixtures.ts`** (`createUser`) — fixture that creates a user with optional email/username.
- **`src/kernel/registry.ts`** (`registerModules`) — wired in the subscriptions `beforeEach` to attach event listeners.
- **`src/kernel/events.ts`** (`resetDomainEvents`) — called before each subscription test so prior event state does not leak.
- **`src/modules.ts`** (`enabledModules`) — the module list passed to `registerModules`.
- **`tests/support/setup-test-db.ts`** (`setupTestDb`) — called once at module top to prepare the test database.
- **`tests/support/caller-context.ts`** (`testCallerContext`) — the caller/auth context passed to every service method that requires one.

## Notes

- The move-to-cart catalogue check is **indirect**: the service delegates to `cartService`, which enforces the public-product rule. The test therefore asserts 404 *and* that no cart line was written, but never calls `productService`'s validation itself. If the cart's gate breaks, this test still catches it.
- The de-activated-product test explicitly asserts the saved line **persists** after a 404 refusal ("a product can come back"). The soft-delete test does **not** include that assertion — it relies on the separate subscription test for cleanup semantics.
- The subscriptions block requires both `resetDomainEvents()` and `registerModules(enabledModules)` in `beforeEach`; omitting either causes silent failures (events fire against stale listeners or no listeners at all).
- `testCallerContext` is passed to every `wishlistService` call but **not** to `productService.removeById` or `userService.removeById` — those admin operations do not require caller context in their signatures.
