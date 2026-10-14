---
source: src/modules/cart/tests/integration/checkout-version.test.ts
sha256: 9084703422b363dedef37f71fb4bd9866286fbf57953c8eb6def2ea20afcf963
generated_at: 2026-10-14T15:15:22.357508+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/checkout-version.test.ts

## Purpose

Integration test (real MongoDB, no mocks) that guarantees two invariants protecting the checkout race guard: (1) every cart mutation that actually changes state bumps the document's `__v`, and (2) `clearLinesIfUnchanged` empties the cart atomically only when `__v` still matches the value read earlier. Together these ensure a line added or removed mid-checkout is detected rather than silently dropped.

## Key elements

- **`versionOf(userId)`** – small helper that reads `cartRepository.findByUserId` and returns the stored `__v` (or `undefined` if no cart).
- **`describe("cart version increments on every write that changes it")`** – eight tests covering: create-cart write, add-new-line, change-quantity, idempotent re-set (must NOT bump), increment, remove-line, clear-cart, and `productRemoveFromCartsById`. Each asserts `__v` went up by exactly 1 (or stayed the same for the idempotent case).
- **`cartWithChoice()`** – factory that creates a user + product, sets one line (qty 2), applies `setShippingMethod('pickup')`, and returns `{ user, product, version }`.
- **`describe("clearLinesIfUnchanged")`** – six tests verifying: successful clear (items emptied, shipping choice removed, `__v` bumped); failed clear on version mismatch (nothing touched, no `updatedAt` drift); replay of the same version loses; empty-then-refill doesn't match an older read; clear does not stamp `updatedAt` (uses `freezeDate`/`advanceDate`); and null return + no document creation for a user with no cart.

## Relationships

- **`src/modules/cart/repository.ts`** – primary SUT; calls `findByUserId`, `setShippingMethod`, `clearLinesIfUnchanged`, and `clearLines`.
- **`src/modules/cart/services/index.ts`** – barrel import for `cartItemSetById`, `cartItemAddById`, `cartItemRemoveById`, `cartRemove`, `productRemoveFromCartsById` (the write operations under test).
- **`src/modules/users/tests/factories.ts`** – `createUser()` for fixture data.
- **`src/modules/products/tests/factories.ts`** – `createProduct()` for fixture data.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises a real Mongo instance for the suite.
- **`tests/support/callers.ts`** – `testCallerContext` passed to `cartItemRemoveById` and `cartRemove`.
- **`tests/support/clock.ts`** – `freezeDate` / `advanceDate` used in the `updatedAt`-stability test.

## Notes

- The module-level doc comment explains *why* a mock cannot substitute for a real driver: the guarantee is the driver's native `$inc` on `__v`, which a Jest mock would not exercise.
- The idempotent re-set case (same quantity) is the single write that must NOT bump; violating it would cause a repeated PUT mid-checkout to falsely trigger a `CART_CHANGED` failure.
- `afterEach(() => jest.useRealTimers())` is scoped to the `clearLinesIfUnchanged` block to ensure the frozen clock is always released, even on assertion failure.
- `cartWithChoice` reads `versionOf` *after* `setShippingMethod`; if that call also bumps `__v`, the captured version already reflects it. Tests that later assert `version + 1` rely on this ordering.
