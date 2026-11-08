---
source: src/modules/cart/tests/integration/checkout-interleavings.test.ts
sha256: 0703b81da2d949e4e6bef97da3a8c02eb9b4ae22192e672cdddb867ee8cda843
generated_at: 2026-11-08T05:19:57.902968+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/checkout-interleavings.test.ts

## Purpose

Integration test that verifies checkout's optimistic-concurrency guard against a **deterministic** cart-write interleaving. Unlike `cart-races.test.ts` (nondeterministic scheduler overlap) or `stock.test.ts` (stubbed `null`), this file injects a real cart mutation at a fixed point inside the checkout — after the version is captured, before the clear — and asserts that the losing checkout leaves zero side effects and that a retry succeeds. It also confirms that a mid-checkout reprice cannot produce a mix of old and new prices across lines, shipping, and the payment intent.

## Key elements

- **`shopperWithCart()`** — Sets up a user, an address, two products (10 on hand each), adds one product × 3 to the cart, and sets pickup shipping. Returns `{ user, product, other }` for the test body.
- **`writeDuringJoin(write)`** — The core injection helper. Spies on `productService.findManyByIds` with `mockImplementationOnce`, letting the original resolve first, then awaiting `write()` before returning. This places the mutation between the version read and the line-join, making the interleaving identical every run.
- **`levelOf(productId)`** — Reads the `stocklevels` row directly (bypassing catalogue cache) to assert `onHand` / `reserved` counters.
- **`cartSnapshot(userId)`** — Captures cart items, shipping method, and `__v` as a plain-data object for before/after comparison.
- **`CART_WRITES`** — Five parameterised cart mutations (add product, raise quantity, remove line, clear cart, change shipping) each of which must invalidate an in-flight checkout.
- **`describe('a cart write between the version read and the clear')`** — Three tests: (1) `it.each` over all five writes asserting 409 / `CART_CHANGED`, zero orders, zero reserved stock, and cart unchanged; (2) retryability — second `orderConfirm` succeeds with the post-write cart; (3) a no-op write (same quantity) does **not** bump `__v` and the checkout still succeeds.
- **`describe('a reprice between the catalogue read and the order write')`** — Changes the product price mid-join and asserts the order, shipping decision (free-above-100), and `paymentService.createIntent` amount all reflect the *original* price read, not the new one.

## Relationships

- **`@modules/products` → `productService`** — Spied on (`findManyByIds`) as the injection point; also the source of the price the checkout reads.
- **`@modules/products/tests/factories`** — Provides `createProduct`, `readProduct`, `saveProduct` (used in the reprice test to mutate a product mid-checkout) and `countersOf` for asserting catalogue-side counters.
- **`@modules/cart/services/index.ts` → `cartService`** — System under test: `addItemById`, `setItemById`, `removeItemById`, `remove`, and `orderConfirm` are all driven by this test.
- **`@modules/cart/repository.ts` → `cartRepository`** — Used to set shipping method and to read cart snapshots for assertions.
- **`@modules/inventory/tests/factories` → `stockLevelRepository`** — Reads the `stocklevels` collection directly to verify holds were not created (or were created on retry).
- **`@modules/orders/tests/factories` → `countOrders`** — Confirms no order document exists after a lost checkout; exactly one after a retry.
- **`@modules/payments` → `paymentService`** — Calls `createIntent` to verify the payment amount matches the price the checkout captured.
- **`@kernel/events` → `resetDomainEvents`** — Clears the domain-event bus between tests to avoid cross-test leakage.
- **`tests/support/checkout-modules.ts` → `registerCheckoutModules`** — Wires up the checkout service graph (cart, inventory, orders, payments) in `beforeEach`.
- **`tests/support/callers.ts` → `testCallerContext`, `asCustomer`** — Supplies the caller identity expected by cart and payment service methods.
- **`@modules/users/tests/factories` → `createUser`** and **`@modules/addresses/tests/factories` → `giveAddress`** — Test-data setup for the shopper.

## Notes

- The injection target is deliberately `productService.findManyByIds` because it is the **only** service call between the cart version read and the line-join. The comment explicitly notes that spying an own method of a plain object is safe under the project's swc mutation-testing harness.
- `mockImplementationOnce` is used (not `mockImplementation`), so subsequent calls in the same test hit the real method — important for the retry test where a second `orderConfirm` must proceed unimpeded.
- The reprice test's arithmetic is load-bearing: 3 × 40 = 120 (free standard shipping), 3 × 10 = 30 (shipping applies). A mixed read would produce 30 + 5 = 35 or 120 + 5 = 125; the assertion pins the intent to exactly 120.
- `CART_CHANGED` is returned as a 409 with a structured `errors[0].code`, not a generic failure message — downstream consumers key on that code.
- The "no-op write" test (same quantity PUT) documents that the guard relies on the `__v` bump, not on a diff of field values; a write that changes nothing must not invalidate.
