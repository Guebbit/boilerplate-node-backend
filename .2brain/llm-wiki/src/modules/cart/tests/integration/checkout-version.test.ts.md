---
source: src/modules/cart/tests/integration/checkout-version.test.ts
sha256: f5eb6ba774b3b0352c91b564d42deadd9b46dcfed9ea168b952d32be5103fd69
generated_at: 2026-09-27T14:47:38.286047+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/checkout-version.test.ts

## Purpose

Integration test (tagged **B4**) that verifies every write a shopper can make to their own cart bumps the MongoDB `__v` field. This guarantees the version-check guard used by checkout (`clearLinesIfUnchanged`) will detect any concurrent mutation. Tests run against a real MongoDB instance because the correctness depends on the driver's `$inc` behavior, which a mock cannot faithfully reproduce.

## Key elements

- **`versionOf(userId)`** — helper that reads the persisted `__v` for a user's cart via `cartRepository.findByUserId`, returning `undefined` if the cart doesn't exist yet.
- **`describe('cart version increments on every write (B4)')`** — seven test cases, each asserting `__v` increases by exactly 1 after a specific write:
  - First write (cart creation via `cartItemSetById`) yields `__v === 1`.
  - Adding a new line to an existing cart (`cartItemSetById`).
  - Changing quantity of an existing line (`cartItemSetById` with new qty).
  - Incrementing a line (`cartItemAddById`).
  - Removing a single line (`cartItemRemoveById`).
  - Clearing the entire cart (`cartRemove`).
  - Bulk removal when a product is deleted (`productRemoveFromCartsById`).

## Relationships

- **`src/modules/cart/repository.ts`** — provides `cartRepository.findByUserId` used by the `versionOf` helper to read `__v`.
- **`src/modules/cart/services/index.ts`** — re-exports the five service functions under test (`cartItemSetById`, `cartItemAddById`, `cartItemRemoveById`, `cartRemove`, `productRemoveFromCartsById`).
- **`src/modules/cart/services/items.ts`** — implementation home for the per-line item operations.
- **`src/modules/cart/services/cleanup.ts`** — implementation home for `cartRemove` and `productRemoveFromCartsById`.
- **`src/modules/products/tests/factories.ts`** — `createProduct` factory used to seed a product ID.
- **`src/modules/users/tests/factories.ts`** — `createUser` factory used to seed a user ID.
- **`tests/support/callers.ts`** — `testCallerContext` passed to auth-gated operations (`cartRemove`, `cartItemRemoveById`).
- **`tests/support/setup-test-db.ts`** — `setupTestDb` spins up a real Mongo instance for the test run.

## Notes

- Tests assert exact `__v` values (or `before + 1`), so they are order-sensitive if the collection isn't cleaned between runs; `setupTestDb` handles that.
- The first-write test expects `__v === 1` (not `0`), encoding the invariant that even cart-creation is a race checkout can lose against.
- `productRemoveFromCartsById` is the only operation not user-scoped in the test; it validates that the bulk sweep also bumps `__v` on each affected cart.
