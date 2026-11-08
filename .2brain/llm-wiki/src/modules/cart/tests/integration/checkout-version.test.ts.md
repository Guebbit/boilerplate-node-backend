---
source: src/modules/cart/tests/integration/checkout-version.test.ts
sha256: 20ac3bd81cff665bd3e912df0f2e1269e524b663fa9033803ce6aefb6e400b12
generated_at: 2026-11-08T05:20:37.300036+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/checkout-version.test.ts

## Purpose

Integration tests that verify the `__v` (MongoDB version) counter on a cart document is bumped by every state-changing write, and that `cartRepository.clearLinesIfUnchanged` correctly acts as a compare-and-swap guard so a concurrent cart mutation invalidates an in-flight checkout rather than silently dropping the mutation. The tests run against a real MongoDB instance because the guarantee under test is the driver's `$inc` atomicity, which a mock cannot exercise.

## Key elements

- **`versionOf(userId)`** – Helper that fetches a user's cart and returns its persisted `__v` (or `undefined` if the cart doesn't exist).
- **`cartWithChoice()`** – Helper that creates a user, a product, adds a line, sets a shipping method, and returns the resulting cart version. Used by the `clearLinesIfUnchanged` suite.
- **`describe('cart version increments on every write that changes it')`** – Asserts `__v` starts at 1, bumps on add / set-quantity / increment / remove / clear / product-pull-out, and does **not** bump on an idempotent same-quantity set.
- **`describe('clearLinesIfUnchanged')`** – Asserts the conditional-clear guard: empties items *and* shipping method on a match; returns `null` and touches nothing on a version mismatch; is single-shot per version; rejects replay after empty-then-refill; and does **not** stamp `updatedAt`.
- **`setupTestDb()`** – Called once at module scope to provision/tear down a dedicated test database.

## Relationships

- **`src/modules/cart/repository.ts`** – Exercises `findByUserId`, `setShippingMethod`, `clearLines`, and `clearLinesIfUnchanged` directly against the real store.
- **`src/modules/cart/services/index.ts`** – Drives every cart mutation through `cartService` (`setItemById`, `addItemById`, `removeItemById`, `remove`, `productRemoveFromCartsById`) to confirm the service layer triggers the version bump.
- **`src/modules/users/tests/factories.ts`** – `createUser()` provides the actor for each test.
- **`src/modules/products/tests/factories.ts`** – `createProduct()` provides the line-item target.
- **`tests/support/callers.ts`** – `testCallerContext` supplies the caller identity required by `removeItemById` and `remove`.
- **`tests/support/clock.ts`** – `freezeDate` / `advanceDate` isolate the `updatedAt`-unchanged assertion in the `clearLinesIfUnchanged` suite.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` wires up the real MongoDB instance for the whole file.

## Notes

- The suite uses a **real MongoDB** (no mocks/in-memory drivers). If the test environment lacks a running Mongo, every test fails at the `setupTestDb()` call.
- The "does not bump" case (idempotent same-quantity set) is the critical negative: a regression here would cause spurious `CART_CHANGED` rejections on repeated PUTs during checkout.
- In the `clearLinesIfUnchanged` block, `afterEach` calls `jest.useRealTimers()` to guarantee the frozen clock from the `updatedAt` test doesn't leak into subsequent tests.
- `clearLinesIfUnchanged` is expected to return `null` (not throw) when the version doesn't match or the cart doesn't exist—callers must treat `null` as "someone else won the race."
