---
source: src/modules/cart/tests/integration/line-availability.test.ts
sha256: 7a0ac017d7582ba5cbe5fafef3f814cf240dbf6ec22e4e5d95e86658c153cd1e
generated_at: 2026-11-08T05:20:52.758573+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/line-availability.test.ts

## Purpose

Integration tests that pin down how the cart presents product lines when a product's state changes after the line was added. The core contract verified: a hidden product (`active: false`) keeps its line but reads `removed`; an off-sale product (`purchasable: false`) keeps its line but reads `unavailable`. Neither state causes the line to be deleted, and each state triggers a distinct checkout-refusal reason.

## Key elements

- **`availabilityOf(userId)`** — helper that fetches the cart view and returns the `availability` string of the first line.
- **`heldBy(userId)`** — helper that returns a `productId → quantity` map from the cart view, used to assert a line was kept or absent.
- **`edit(id, data)`** — helper that calls `productService.updateById` to flip `active` or `purchasable` the way an admin edit would.
- **`describe('a hidden product (active: false)')`** — verifies line is kept as `removed`, reactivating restores `in_stock`; new adds return 404; checkout rejects with `CART_PRODUCT_UNAVAILABLE` / 409.
- **`describe('an off-sale product (purchasable: false)')`** — verifies the line is accepted and reads `unavailable`; putting back on sale restores `in_stock`; checkout rejects with `CART_INSUFFICIENT_STOCK` / 409 (naming the line `unavailable`); no shelf hold is placed on refusal.
- **`describe('merge, by product state')`** — verifies `cartService.merge` adds off-sale lines (availability `unavailable`, no event) but rejects hidden-product lines (reason `removed`, availability `removed`, zero resulting quantity) and fires `CART_MERGE_REFUSED`.

## Relationships

- **`src/modules/cart/services/index.ts`** — the primary subject under test (`cartService.addItemById`, `getForView`, `orderConfirm`, `merge`).
- **`src/modules/cart/repository.ts`** — `cartRepository.setShippingMethod` is called to satisfy a checkout prerequisite.
- **`src/modules/cart/events.ts`** — imports the `CART_MERGE_REFUSED` constant to subscribe a spy via the event bus.
- **`src/kernel/events.ts`** — provides `onDomainEvent` (subscribe spy) and `resetDomainEvents` (cleanup in `beforeEach`).
- **`src/modules/products/index.ts`** / **`src/modules/products/services/index.ts`** — `productService.updateById` is used to toggle product flags mid-test.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds products with chosen `active`, `purchasable`, and `onHand` values.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds the buyer.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` satisfies a checkout precondition.
- **`src/modules/payments/module.ts`** — registered via `registerCheckoutModules` so the checkout flow can execute.
- **`tests/support/callers.ts`** — supplies `testCallerContext` for all service calls.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` wires the payments module into the test registry.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the in-memory/persisted test database.

## Notes

- The two product flags are deliberately asymmetric: `active: false` hides the product (404 on add, `CART_PRODUCT_UNAVAILABLE` on checkout), while `purchasable: false` only blocks purchase (add succeeds, `CART_INSUFFICIENT_STOCK` on checkout). Conflating them is the bug this suite guards against.
- `CART_MERGE_REFUSED` is fired **only** for hidden products during merge; off-sale products merge silently. The spy is registered per-suite, not globally, to avoid cross-test leakage.
- The test asserts checkout returns the same 409 status on both the pre-flight validation path and the write-side refusal path (comment in the hidden-product checkout test).
- Product IDs are always passed as `String(product._id)` to match the cart's string-keyed storage.
