---
source: src/modules/cart/tests/integration/line-availability.test.ts
sha256: 7a0ac017d7582ba5cbe5fafef3f814cf240dbf6ec22e4e5d95e86658c153cd1e
generated_at: 2026-10-29T03:28:09.788232+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/line-availability.test.ts

## Purpose

Integration tests that verify how the cart presents two distinct product states to the user: a **hidden** product (`active: false`) reads as `removed` and is refused on new-add (404) and checkout (409, `CART_PRODUCT_UNAVAILABLE`), while an **off-sale** product (`purchasable: false`) reads as `unavailable`, is accepted into the cart, and is refused at checkout under the stock path (409, `CART_INSUFFICIENT_STOCK`). Also covers `cartService.merge` behavior and the `CART_MERGE_REFUSED` domain event for each state.

## Key elements

- **`availabilityOf(userId)`** – helper that resolves the `availability` string of the first cart line for a user.
- **`heldBy(userId)`** – helper that returns a `productId → quantity` map of the user's cart, used to assert that a line was kept or absent.
- **`edit(id, data)`** – shorthand for `productService.updateById`, used to flip `active` or `purchasable` mid-test.
- **`describe('a hidden product (active: false)')`** – 3 tests: line kept + reads `removed` + reverses on reactivation; new-add returns 404; checkout returns 409 with `CART_PRODUCT_UNAVAILABLE`.
- **`describe('an off-sale product (purchasable: false)')`** – 4 tests: add succeeds and reads `unavailable`; reactivation restores `in_stock`; checkout returns 409 with `CART_INSUFFICIENT_STOCK` and a per-line `availability: 'unavailable'` detail; no shelf hold is placed on refusal.
- **`describe('merge, by product state')`** – 2 tests: off-sale product is merged in (flagged `unavailable`, no event); hidden product is refused (`resulting: 0`, `reason: 'removed'`, `CART_MERGE_REFUSED` fired once).

## Relationships

- **`src/kernel/events.ts`** – imports `onDomainEvent` and `resetDomainEvents` to subscribe to `CART_MERGE_REFUSED` and clear the event bus between tests.
- **`src/modules/cart/services/index.ts`** – imports `cartService`, the primary system under test (`getForView`, `addItemById`, `orderConfirm`, `merge`).
- **`src/modules/cart/repository.ts`** – imports `cartRepository` to set a shipping method before checkout tests.
- **`src/modules/cart/events.ts`** – imports `CART_MERGE_REFUSED` for the merge-refusal event assertion.
- **`src/modules/products/index.ts`** – imports `productService` for the `edit` helper (admin-side flag changes).
- **`src/modules/products/tests/factories.ts`** – imports `createProduct` with state-specific options (`active`, `purchasable`, `onHand`).
- **`src/modules/users/tests/factories.ts`** – imports `createUser` for test identity.
- **`src/modules/addresses/tests/factories.ts`** – imports `giveAddress` to satisfy checkout's shipping preconditions.
- **`src/modules/payments/module.ts`** – imports `paymentsModule`, registered via `registerCheckoutModules` so the checkout pipeline runs.
- **`tests/support/setup-test-db.ts`** – calls `setupTestDb()` at module scope for a clean database per test.
- **`tests/support/callers.ts`** – imports `testCallerContext` as the caller identity for all service calls.
- **`tests/support/checkout-modules.ts`** – imports `registerCheckoutModules` to wire the payments module into the checkout flow.

## Notes

- The file's doc comment states a deliberate invariant: **no test here removes a cart line**; only an explicit deletion does. All assertions that a line is "absent" are actually checking that a *new* add was refused, not that an existing line vanished.
- Hidden-product checkout refusal uses `CART_PRODUCT_UNAVAILABLE` (409), while off-sale uses `CART_INSUFFICIENT_STOCK` (also 409). Both return 409, but the error codes and detail shapes differ—tests assert both.
- `CART_MERGE_REFUSED` is fired **only** for hidden products during merge; off-sale products are merged in normally (flagged `unavailable`) and do **not** trigger the event.
- The `announced` mock is reset in the merge `beforeEach`; the hidden-product test asserts exactly one call, the off-sale test asserts zero.
