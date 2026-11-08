---
source: src/modules/cart/tests/integration/product-restored-meanwhile.test.ts
sha256: faf1b4aa4db10b9ce7a07fd8fd757b4064fad4432c5acf321104e3b7697d9333
generated_at: 2026-11-08T05:22:27.703464+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/product-restored-meanwhile.test.ts

## Purpose

Integration test for a specific event-ordering race: a `product.deleted` delivery that is retried by the relay *after* the product has already been restored. Because a restore writes no compensating event, the retried deletion is the only remaining "deleted" signal; this test proves that cart lines and wishlist entries for the now-restored product survive, while a normal (non-late) deletion still clears the cart.

## Key elements

- **`basketLines(userId)`** – Helper that returns the number of lines in a user's cart via `cartService.get`.
- **`describe('a late product.deleted for a restored product')`** – The test suite.
  - *Test 1: "leaves the basket line and the wishlist entry…"* – Creates a product, soft-deletes it, flushes the outbox, restores it, adds it to cart + wishlist, then manually emits a second `PRODUCT_DELETED` event (simulating the relay retry). Asserts cart still has 1 line and wishlist still has 1 item.
  - *Test 2: "still pulls the lines of a product that is deleted"* – Adds a product to cart, deletes it, flushes the outbox, and asserts the cart is empty (sanity check that deletion still works).
- **`beforeEach`** – Registers `wishlistModule` into the checkout-module registry.
- **`afterEach`** – Calls `resetDomainEvents()` to clear the in-memory event bus between tests.

## Relationships

- **`src/kernel/events.ts`** – `emitDomainEvent` simulates the late retry delivery; `resetDomainEvents` tears down the event bus per test.
- **`src/kernel/outbox.ts`** – `settleOutboxNudges` flushes pending outbox entries so the initial deletion's side-effects complete before the restore step.
- **`src/modules/cart/services/index.ts`** – `cartService` provides `get` and `setItemById`; cart lines are the primary assertion target.
- **`src/modules/products/index.ts`** – Barrel export of `PRODUCT_DELETED` (event constant) and `productService` (`removeById`, `restoreById`).
- **`src/modules/products/services/index.ts`** – Underlying implementation behind the `productService` barrel export.
- **`src/modules/products/tests/factories.ts`** – `createProduct({ onHand: 5 })` seeds a sellable product.
- **`src/modules/users/tests/factories.ts`** – `createUser()` seeds a shopper.
- **`src/modules/wishlist/index.ts`** / **`src/modules/wishlist/module.ts`** / **`src/modules/wishlist/service.ts`** – `wishlistService` (add, get) and `wishlistModule` (registered for event subscriptions).
- **`tests/support/callers.ts`** – `testCallerContext` required by `wishlistService.add`.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules` wires modules into the event-subscription graph.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the test database.

## Notes

- The test does **not** rely on the outbox to deliver the late event. After `settleOutboxNudges()` resolves the *first* (pre-restore) delivery, the late `PRODUCT_DELETED` is emitted directly via `emitDomainEvent`, faithfully simulating a relay retry that the outbox would have delivered out of order.
- `productService.removeById(id, false)` performs a **soft** delete; the subsequent `restoreById` makes the product sellable again. A `hardDelete: false` flag is passed in the manually emitted event to match the soft-delete semantics.
- The second test deliberately omits the restore step to confirm the happy-path deletion still clears the cart—guarding against an over-broad "ignore all deletions" fix.
