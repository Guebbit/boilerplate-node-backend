---
source: src/modules/wishlist/tests/integration/service.test.ts
sha256: 449a7a8321d1e96b6e527a77b6f0bda81fc8ebf0e998ca4cdf3e563ae4ca152d
generated_at: 2026-09-23T19:49:01.320532+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/integration/service.test.ts

## Purpose

Integration tests for the wishlist service, exercising the full request path (service → repository → DB) against a real test database. Covers the four core operations (add, remove, move-to-cart), their error contracts, the "write cart before dropping line" ordering guarantee, and the event-driven cleanup subscriptions that fire on product/user hard-deletion.

## Key elements

- **`savedIds(userId)`** — local helper that calls `wishlistService.wishlistGet` and extracts the array of product IDs, used as the primary assertion target throughout.
- **`describe('wishlistAdd')`** — verifies a successful save, idempotency (`$addToSet` leaves one line), and the catalogue gate (inactive product → `404`, nothing written).
- **`describe('wishlistRemove')`** — verifies targeted removal of one line while keeping others, and `404` when the caller never saved the product.
- **`describe('wishlistMoveToCart')`** — the largest block. Confirms the line lands in the cart and is dropped from the wishlist, that an existing cart line is incremented, and that refusals (never-saved, de-activated, soft-deleted product) return `404` with **no cart write and the wishlist line intact**. Also asserts the one exception: a cart-level `422` (line already at 999) is forwarded verbatim rather than collapsed to `404`.
- **`describe('the module subscriptions')`** — registers modules and resets domain events in `beforeEach`; then verifies that hard-deleting a product purges it from every user's wishlist (event-driven), and hard-deleting a user removes their wishlist row entirely.

## Relationships

- **`src/modules/wishlist/service.ts`** — the unit under test; every operation is invoked through `wishlistService`.
- **`src/modules/wishlist/repository.ts`** — used directly in the user-deletion test (`findByUserId`) because the service view is not meaningful once the user row is gone.
- **`src/modules/cart/index.ts`** / **`src/modules/cart/services/index.ts`** — `cartService.cartGetForBadge` and `cartItemAddById` verify post-move cart state and pre-seed cart lines.
- **`src/modules/products/service.ts`** — `productService.updateById` (deactivate) and `productService.removeById` (soft/hard delete) drive mid-test catalogue changes.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds fixture products, optionally with `{ active: false }`.
- **`src/modules/users/service.ts`** — `userService.removeById(id, true)` triggers the user-deletion subscription.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds fixture users.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears the event bus between subscription tests.
- **`src/kernel/registry.ts`** — `registerModules` wires module event subscriptions so the subscription tests actually fire.
- **`src/modules.ts`** — `enabledModules` provides the module list passed to `registerModules`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises/clears the test database for the suite.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity every service call expects.

## Notes

- **Withdrawal ≠ deletion.** De-activating a product (`active: false`) is the "withdrawal" case: the wishlist line *survives* and the move-to-cart fails with 404, but the line is still there. Hard-deletion (`removeById(id, true)`) fires the `PRODUCT_DELETED` subscription and *purges* the line. Tests for both shapes exist deliberately.
- **Ordering guarantee.** Every move-to-cart refusal assertion checks both that the cart is empty *and* that `savedIds` still contains the product — encoding the "write cart before dropping line" rule from the module docstring.
- **Subscription tests require fresh wiring.** `resetDomainEvents()` + `registerModules(enabledModules)` in `beforeEach` is mandatory; without it, stale listeners from other suites produce flaky cleanup behaviour.
- **The 422 case is the only non-404 refusal.** It exists to guard against a regression where the service naively maps every cart failure to its own 404, swallowing the "line is already at max quantity" message the shopper needs to see.
