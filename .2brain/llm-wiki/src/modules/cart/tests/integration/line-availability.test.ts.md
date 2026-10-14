---
source: src/modules/cart/tests/integration/line-availability.test.ts
sha256: 15c67eff6ccdf6dbc20bfe434cc2e7e6dbe82a87b52c351052d9d412997ec35c
generated_at: 2026-10-14T15:15:48.224971+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/line-availability.test.ts

## Purpose

Integration tests that verify how cart lines reflect product availability state driven by the `active` and `purchasable` flags. The core invariant under test: a hidden product's line is **kept** and reads `removed`, an off-sale product's line is **kept** and reads `unavailable`, and checkout refuses both but for different reasons. No test here asserts line removal—only deletion does that.

## Key elements

- **`availabilityOf(userId)`** — helper returning the `availability` string of the first cart line.
- **`heldBy(userId)`** — helper returning a `productId → quantity` map of all lines in the cart.
- **`edit(id, data)`** — helper wrapping `productService.updateById` to flip `active`/`purchasable` flags as an admin edit would.
- **`describe('a hidden product (active: false)')`** — verifies line reads `removed`, reactivation restores `in_stock`, new adds return 404, and checkout fails with `CART_PRODUCT_UNAVAILABLE`.
- **`describe('an off-sale product (purchasable: false)')`** — verifies the line is accepted, reads `unavailable`, checkout fails with `CART_INSUFFICIENT_STOCK` (status 409) naming the line, and no inventory hold is placed on refusal.
- **`describe('merge, by product state')`** — verifies `cartMerge` adds off-sale lines (flagged `unavailable`, no event) but refuses hidden lines (`reason: 'removed'`, `resulting: 0`, announces `CART_MERGE_REFUSED`).

## Relationships

- **`src/modules/cart/services/index.ts`** — imports `cartGetForView`, `cartItemAddById`, `cartMerge`, `orderConfirm`; these are the primary APIs under test.
- **`src/modules/cart/repository.ts`** — calls `cartRepository.setShippingMethod` to set up checkout preconditions.
- **`src/modules/cart/events.ts`** — imports `CART_MERGE_REFUSED` to subscribe via the domain-event bus in merge tests.
- **`src/kernel/events.ts`** — uses `onDomainEvent` and `resetDomainEvents` to observe and isolate the merge-refused event.
- **`src/modules/products/index.ts` / `src/modules/products/services/index.ts`** — imports `productService` to perform flag edits mid-test.
- **`src/modules/products/tests/factories.ts`** — `createProduct` with `active`, `purchasable`, `onHand` variants.
- **`src/modules/users/tests/factories.ts`** — `createUser` for cart ownership.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` to satisfy checkout's address requirement.
- **`src/modules/payments/module.ts`** — registered via `registerCheckoutModules` so `orderConfirm` can exercise the full checkout pipeline.
- **`tests/support/callers.ts`** — provides `testCallerContext` used in every service call.

## Notes

- Hidden and off-sale products are refused by checkout with **different error codes and HTTP statuses**: `CART_PRODUCT_UNAVAILABLE` (no explicit status asserted) vs `CART_INSUFFICIENT_STOCK` (409). This distinction is intentional and asserted explicitly.
- Adding a hidden product returns a **404** (not a domain error code), so hidden products are effectively invisible to the cart-add endpoint. Off-sale products are added normally.
- The merge test's `announced` mock is declared at `describe` scope with a shared `jest.fn()`, reset in `beforeEach`; the `onDomainEvent` subscription is re-registered each time to avoid cross-test leakage.
- The module doc comment and the `CART_MERGE_REFUSED` subscription make it clear that only the *hidden* merge refusal fires a domain event; the *off-sale* merge refusal is silent.
