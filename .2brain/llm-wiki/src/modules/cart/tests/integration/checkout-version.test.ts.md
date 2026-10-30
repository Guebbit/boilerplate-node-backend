---
source: src/modules/cart/tests/integration/checkout-version.test.ts
sha256: 20ac3bd81cff665bd3e912df0f2e1269e524b663fa9033803ce6aefb6e400b12
generated_at: 2026-10-29T03:27:52.176074+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/checkout-version.test.ts

## Purpose

Integration test (run against a real MongoDB instance) that verifies every cart-mutating write bumps the document's `__v` version field, and that the conditional clear (`clearLinesIfUnchanged`) correctly uses that version as an optimistic-lock guard. The guarantee being locked in is the driver's `$inc` behavior: a write that skips the bump would be invisible to the checkout race guard, allowing a concurrent line change to be silently dropped.

## Key elements

- **`versionOf(userId)`** — local helper; reads the cart via `cartRepository.findByUserId` and returns its `__v` (or `undefined` if no cart exists).
- **`describe('cart version increments on every write that changes it')`** — suite of 8 tests asserting `__v` increases by exactly 1 after: cart creation, adding a new line, changing an existing line's quantity, incrementing a line, removing a line, clearing the whole cart, and product-removal from carts. One test asserts the *opposite*: setting a line to the quantity it already holds does **not** bump `__v`.
- **`cartWithChoice()`** — local helper; creates a user + product, adds a line, sets a shipping method, and returns `{ user, product, version }`.
- **`describe('clearLinesIfUnchanged')`** — suite of 6 tests covering: successful clear (items emptied, shipping choice cleared, `__v` bumped, `updatedAt` *not* stamped), no-op when version is stale, replay of a consumed version returns `null`, emptied-and-refilled cart does not match an older read, and `null`/no-document creation for a user with no cart.

## Relationships

- **`src/modules/cart/repository.ts`** — Under test. Calls `findByUserId`, `setShippingMethod`, `clearLinesIfUnchanged`, and `clearLines` to exercise the conditional-write path and inspect persisted state.
- **`src/modules/cart/services/index.ts`** — Drives all cart mutations (`setItemById`, `addItemById`, `removeItemById`, `remove`, `productRemoveFromCartsById`) whose effects on `__v` are asserted.
- **`src/modules/users/tests/factories.ts`** — `createUser()` supplies a persistent user document for each scenario.
- **`src/modules/products/tests/factories.ts`** — `createProduct()` supplies product documents to add to carts.
- **`tests/support/callers.ts`** — `testCallerContext` is passed to service methods that require caller identity (`removeItemById`, `remove`).
- **`tests/support/clock.ts`** — `freezeDate` / `advanceDate` advance time in one `clearLinesIfUnchanged` test to prove `updatedAt` is *not* stamped on a successful clear.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module level to provide a real, isolated MongoDB instance for the entire suite.

## Notes

- **Real Mongo, not mocks.** The module docblock states the invariant depends on the driver's `$inc`; a mock cannot demonstrate it. Do not replace the repository with a stub in this file.
- **`afterEach` scope.** The `jest.useRealTimers()` reset lives inside the `clearLinesIfUnchanged` describe block only; it exists because that block is the sole consumer of fake timers.
- **Version starts at 1, not 0.** The first write (cart creation) must already be distinguishable from "no write happened yet," so the expected value after creation is `1`.
- **No-op write.** Setting a line to the quantity it already holds must leave `__v` unchanged; this prevents a repeated PUT mid-checkout from spuriously invalidating the in-flight checkout.
- **`updatedAt` must not move on clear.** One test freezes the clock, advances 60 s, performs a successful clear, and asserts `updatedAt` is unchanged — the checkout's own emptying should not make the cart look "recently edited" to other guards.
