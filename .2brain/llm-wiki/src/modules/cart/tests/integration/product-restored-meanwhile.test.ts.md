---
source: src/modules/cart/tests/integration/product-restored-meanwhile.test.ts
source_sha256: faf1b4aa4db10b9ce7a07fd8fd757b4064fad4432c5acf321104e3b7697d9333
context_sha256: dd8c182b2753ee5691fc19768a81e3dc51f12ac08982b8fcf3219841b917d1e3
generated_at: 2026-11-22T04:41:36.683829+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/integration/product-restored-meanwhile.test.ts

## Purpose
Integration test guarding a race: a late `product.deleted` delivery (the outbox relay retries a failed handler) must not empty baskets and wishlists of a product that was restored in the meantime. A restore writes no event of its own, so the retried delete event is the only thing that could still say "deleted". The file also checks the normal case, where deleting a product does pull it from baskets.

## Key elements
- `setupTestDb()` — sets up the test database for the suite.
- `beforeEach` — calls `registerCheckoutModules([wishlistModule])` so the wishlist module's handlers are active.
- `afterEach` — calls `resetDomainEvents()` to clear event registrations between tests.
- `basketLines(userId)` — helper returning the number of lines in the user's basket via `cartService.get`.
- Test 1, "leaves the basket line and the wishlist entry of a product on sale again":
  - Creates a user and a product (`onHand: 5`), soft-deletes it with `productService.removeById(id, false)`, settles outbox nudges, then restores it with `restoreById`.
  - Adds the product to the basket and the wishlist, then manually re-emits `PRODUCT_DELETED` (`hardDelete: false`, `titles: {}`) to simulate the retry.
  - Expects one basket line and one wishlist item to remain.
- Test 2, "still pulls the lines of a product that is deleted":
  - Puts a product in the basket, soft-deletes it, settles outbox nudges, and expects 0 basket lines.

## Relationships
- `src/kernel/events.ts` — supplies `emitDomainEvent` (used to simulate the late delivery) and `resetDomainEvents`.
- `src/kernel/outbox.ts` — `settleOutboxNudges` waits for the outbox delivery of the real delete event to finish.
- `src/modules/products/index.ts` and `src/modules/products/services/index.ts` — `productService` (`removeById`, `restoreById`) and the `PRODUCT_DELETED` event constant.
- `src/modules/products/tests/factories.ts` — `createProduct`.
- `src/modules/users/tests/factories.ts` — `createUser`.
- `src/modules/cart/services/index.ts` — the cart services module, imported as `../../services`; provides `cartService` (`get`, `setItemById`).
- `src/modules/wishlist/index.ts` and `src/modules/wishlist/service.ts` — `wishlistService` (`add`, `get`).
- `src/modules/wishlist/module.ts` — the wishlist module registered so it reacts to product deletion.
- `tests/support/setup-test-db.ts`, `tests/support/checkout-modules.ts`, `tests/support/callers.ts` — test DB setup, module registration, and `testCallerContext` for wishlist calls.

## Notes
- The first test's wishlist assertions run after the manual `emitDomainEvent`, which is awaited directly rather than settled via the outbox.
- The cart and wishlist entries are added only after the restore, so they can only be removed by the late event.
