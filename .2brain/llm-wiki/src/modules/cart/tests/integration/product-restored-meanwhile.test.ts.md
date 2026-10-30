---
source: src/modules/cart/tests/integration/product-restored-meanwhile.test.ts
sha256: faf1b4aa4db10b9ce7a07fd8fd757b4064fad4432c5acf321104e3b7697d9333
generated_at: 2026-10-29T03:29:24.895002+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/product-restored-meanwhile.test.ts

## Purpose

Integration test for the race condition where a relay-retried `product.deleted` delivery arrives *after* the product has been restored. Because a restore writes no compensating event, the stale retry is the only signal that could still say "deleted"—this file verifies that cart and wishlist handlers correctly ignore it.

## Key elements

- **`basketLines(userId)`** — local helper that returns the number of lines in a shopper's basket via `cartService.get`.
- **`describe('a late product.deleted for a restored product', …)`** — contains two cases:
  - *Restores are idempotent:* after `productService.restoreById`, a manually re-emitted `PRODUCT_DELETED` must leave the basket line and wishlist entry intact.
  - *Genuine deletions still work:* if no restore happened, the same `PRODUCT_DELETED` delivery must empty the basket.
- **`setupTestDb()`** — in-memory DB per test.
- **`beforeEach` / `afterEach`** — registers the wishlist module as an event subscriber; resets the in-memory domain-event bus after each test.

## Relationships

- **`@kernel/events`** — `emitDomainEvent` simulates the late retry delivery; `resetDomainEvents` clears the bus between tests.
- **`@kernel/outbox`** — `settleOutboxNudges` flushes queued outbox rows so the initial delete delivery is processed *before* the restore call, establishing the timing.
- **`@modules/products`** — `productService.removeById` / `restoreById` drive the product state; `PRODUCT_DELETED` constant is re-emitted manually.
- **`@modules/products/tests/factories`** — `createProduct` seeds a product with stock.
- **`@modules/users/tests/factories`** — `createUser` seeds a shopper.
- **`@modules/wishlist` / `@modules/wishlist/module`** — `wishlistService.add` / `.get` verify wishlist state; `wishlistModule` is registered so its event handler runs on the bus.
- **`../../services` (cart)** — `cartService.setItemById` / `.get` exercise the cart side of the assertion.
- **`tests/support/callers`** — `testCallerContext` supplies the caller identity required by `wishlistService.add`.
- **`tests/support/checkout-modules`** — `registerCheckoutModules` wires the wishlist module into the event pipeline for the test.
- **`tests/support/setup-test-db`** — provides the shared in-memory database fixture.

## Notes

- The test does **not** rely on the outbox to deliver the "late" event; it calls `emitDomainEvent(PRODUCT_DELETED, …)` directly to model the relay retry. This is intentional: the real scenario is a *duplicate* delivery, not a fresh one.
- `settleOutboxNudges()` is called **before** `restoreById` to guarantee the first (pre-restore) delivery has already been attempted, making the subsequent manual emission the "late retry" the module docstring describes.
- `hardDelete: false` in the re-emitted payload mirrors a soft-delete retry; a hard-delete path would need different handler logic and is not covered here.
