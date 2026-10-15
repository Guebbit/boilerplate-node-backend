---
source: tests/integration/concurrency/checkout-interleavings.test.ts
sha256: 679ee7481bf09b27a81f9f5f3945b5cd91933b39e2e053f714ddf08992055c95
generated_at: 2026-10-15T12:45:37.226973+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/concurrency/checkout-interleavings.test.ts

## Purpose

Deterministic integration test for the checkout concurrency guard. Unlike `cart-races.test.ts` (which fires N parallel checkouts and hopes the scheduler overlaps them) or `stock.test.ts` (which stubs `clearLinesIfUnchanged` to `null`), this file injects a real cart write at a fixed point—after the version read, during the product join—so every run exercises the same interleaving. It verifies that a lost checkout leaves no residue (no order, no hold, cart untouched) and that a mid-checkout reprice cannot produce a half-applied state.

## Key elements

- **`writeDuringJoin(write)`** — Spies on `productService.findManyByIds` with `mockImplementationOnce`, letting `write` execute after the cart version is captured but before the join returns. This is the single deterministic injection point for both describe blocks.
- **`shopperWithCart()`** — Fixture factory: creates a user + address, two products (onHand 10 each), adds 3 of the first product to the cart, and sets shipping to `pickup`.
- **`CART_WRITES`** — Array of five `CartWrite` objects (add item, raise quantity, remove line, clear cart, change shipping) used with `it.each` to assert the same `CART_CHANGED` invariants under every mutation.
- **`levelOf(productId)`** — Reads `{ onHand, reserved }` directly from `stockLevelRepository.findByProductId`, bypassing the catalogue cache.
- **`cartSnapshot(userId)`** — Reads the cart via `cartRepository.findByUserId` and returns plain `{ items, shippingMethodId, version }` for deep-equality assertions.
- **`describe('a cart write between the version read and the clear')`** — Three tests: the `it.each` over all five writes (expecting 409 / `CART_CHANGED`, zero orders, unchanged stock, cart matching the post-write snapshot); a retry-ability test (first checkout fails, second succeeds with correct holds); and a no-op test (setting quantity to the same value does not bump `__v`, so checkout still succeeds).
- **`describe('a reprice between the catalogue read and the order write')`** — Single test that changes the product price from 40 → 10 mid-join and asserts the order, free-shipping decision, and payment intent all reflect the original 40-price reading (3×40 = 120, free standard shipping, intent amount 120).

## Relationships

- **`src/modules/cart/services/index.ts`** (`cartService`) — The system under test. `orderConfirm` is the checkout entry point; `cartItemAddById`, `cartItemSetById`, `cartItemRemoveById`, `cartRemove` are the writes injected during the join.
- **`src/modules/cart/repository.ts`** (`cartRepository`) — `setShippingMethod` in setup; `findByUserId` in `cartSnapshot`.
- **`src/modules/products/index.ts`** (`productService`) — `findManyByIds` is the spy target; the test asserts the join result is used atomically.
- **`src/modules/products/tests/factories.ts`** — `createProduct`, `readProduct`, `saveProduct` (reprice test), `countersOf` (stock assertion).
- **`src/modules/inventory/repository.ts`** (`stockLevelRepository`) — `findByProductId` in `levelOf` to verify holds were never created or were rolled back.
- **`src/modules/payments/services/index.ts`** (`createIntent`) — Builds a payment intent against the placed order to confirm the amount matches the consistent reading.
- **`src/modules/orders/tests/factories.ts`** (`countOrders`) — Asserts zero or one order exists after the scenario.
- **`src/modules/users/tests/factories.ts`** (`createUser`) — Fixture.
- **`src/modules/addresses/tests/factories.ts`** (`giveAddress`) — Fixture.
- **`src/kernel/events.ts`** (`resetDomainEvents`) — Called in `beforeEach` to clear the event bus between tests.
- **`tests/support/checkout-modules.ts`** (`registerCheckoutModules`) — Registers the module wiring that `orderConfirm` depends on; called in `beforeEach`.
- **`tests/support/setup-test-db.ts`** (`setupTestDb`) — Top-level call; prepares the in-memory/ephemeral database before the suite.
- **`tests/support/callers.ts`** (`testCallerContext`, `asCustomer`) — Provides the auth context required by cart and payment calls.

## Notes

- The spy on `productService.findManyByIds` targets an own method on a plain object (not a class prototype), which the file's comment notes is safe under the swc-based mutation-testing harness. If `findManyByIds` moves to a class or gets a getter, the spy will silently fail.
- The no-op test (setting quantity to the same value) relies on Mongoose's `__v` not incrementing when the document is unchanged. If the cart service ever calls `save()` unconditionally or the repository switches to a non-Mongoose driver, this test's assumption breaks.
- `writeDuringJoin` uses `mockImplementationOnce`, so only the *next* call to `findManyByIds` is intercepted. If checkout calls `findManyByIds` more than once internally, the second call goes through unmodified.
- The reprice test encodes specific arithmetic (3 × 40 = 120 ≥ 100 free-shipping threshold; repriced 3 × 10 = 30 < 100) to make a mixed state (new price + old shipping, or old price + new shipping) arithmetically detectable. Changing the free-shipping threshold or the quantities will weaken or break that discrimination.
- `setupTestDb()` is called at module scope (not in `beforeEach`), so the database is created once for the whole file. `resetDomainEvents` and `registerCheckoutModules` run per-test to isolate state.
