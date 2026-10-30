---
source: src/modules/cart/tests/integration/checkout-interleavings.test.ts
sha256: 29d6fb5468b3108f1189bc9c4c450af59c5f77620e2b21bc3ee203797c5af014
generated_at: 2026-10-29T03:27:22.947892+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/integration/checkout-interleavings.test.ts

## Purpose

Integration test that verifies the cart version-guard catches a **real** cart mutation landing between the version read and the cart clear during `orderConfirm`, and that a mid-checkout reprice cannot produce a half-applied price. Unlike `cart-races.test.ts` (scheduler-dependent overlap) and `stock.test.ts` (stubbed `clearLinesIfUnchanged`), this file injects the write at a deterministic point so the interleaving is identical on every run.

## Key elements

- **`writeDuringJoin(write)`** — Spies `productService.findManyByIds` with `mockImplementationOnce`, executing `write` after the real join resolves but before the result returns. This is the one call between the cart version read and the subsequent clear, making the interleaving fixed.
- **`shopperWithCart()`** — Creates a user, an address, two products (each `onHand: 10`), adds 3 of the first to the cart, and sets shipping to `pickup`. Returns the handles the tests need.
- **`CART_WRITES`** — Readonly array of five `CartWrite` entries (add item, raise quantity, remove item, clear cart, change shipping). Drives an `it.each` that asserts each one produces `CART_CHANGED`, zero orders, untouched stock, and an unmodified cart.
- **`cartSnapshot(userId)`** — Projects the cart to `{ items, shippingMethodId, version }` so tests can compare before/after with `toEqual`.
- **`levelOf(productId)`** — Reads the stock-level row directly from the `stocklevels` collection (not the catalogue cache) to assert `onHand`/`reserved`.
- **`describe('a cart write between the version read and the clear')`** — The `it.each` invariant suite, a retry-ability test (lost checkout → immediate retry succeeds with the post-write cart), and a no-op-write test (same-quantity PUT must not bump `__v` and must not trigger `CART_CHANGED`).
- **`describe('a reprice between the catalogue read and the order write')`** — Prices a 3×40 item, drops the price to 10 mid-join, then asserts the order still shows 40, free shipping (120 > 100 threshold), and a 120-unit payment intent — proving lines, shipping decision, and intent all come from a single catalogue read.

## Relationships

- **`src/modules/cart/services/index.ts`** — `cartService` is the system under test; every mutation and `orderConfirm` call goes through it.
- **`src/modules/cart/repository.ts`** — `cartRepository.setShippingMethod` and `findByUserId` provide direct repository access for setup and snapshotting.
- **`src/modules/products/index.ts` / `services/index.ts`** — `productService.findManyByIds` is the spied method; `createProduct`, `readProduct`, `saveProduct`, `countersOf` from `tests/factories` support the reprice test.
- **`src/modules/inventory/tests/factories.ts`** — `stockLevelRepository.findByProductId` reads the level collection directly to verify holds were released.
- **`src/modules/orders/tests/factories.ts`** — `countOrders` confirms no orphan order survived a lost checkout.
- **`src/modules/payments/index.ts` / `services/index.ts`** — `paymentService.createIntent` verifies the intent amount matches the single-read pricing.
- **`src/modules/users/tests/factories.ts`** / **`src/modules/addresses/tests/factories.ts`** — `createUser`, `giveAddress` for fixture setup.
- **`src/kernel/events.ts`** — `resetDomainEvents()` in `beforeEach` isolates the domain-event bus per test.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules()` wires the checkout service dependencies into the DI container.
- **`tests/support/callers.ts`** — `testCallerContext` and `asCustomer` supply the auth context required by `orderConfirm`, `removeItemById`, and `createIntent`.

## Notes

- The spy targets `productService.findManyByIds` specifically because it is the **only** async call between the cart version read and the subsequent clear; spying any other method would not reproduce the interleaving. The comment in the file notes this is safe under the SWC mutation harness because it's an own method of a plain object.
- `mockImplementationOnce` ensures the injected write fires exactly once; subsequent calls in the same test (e.g., the retry) use the real method.
- Adding a new cart-mutation scenario is a one-entry append to `CART_WRITES`; the `it.each` and all five assertions are reused automatically.
- The reprice test deliberately uses numbers where a mixed application (new price + old shipping decision) would produce a distinguishable total (30 or 125 vs. the correct 120), so the assertion catches partial application.
