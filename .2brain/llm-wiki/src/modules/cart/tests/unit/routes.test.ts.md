---
source: src/modules/cart/tests/unit/routes.test.ts
sha256: ae8173b8dd0b53e79fd1664cd8a6ecd91946c3091f3321e9bda241fe4a7c173d
generated_at: 2026-09-27T14:48:48.718452+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/routes.test.ts

## Purpose

Unit test for the cart router that pins down three invariants: the exact set and order of mounted routes, universal `isAuth` guarding, and the caching contract (checkout invalidates the product cache; no route *sets* a cache). It exists to catch regressions where a new route is added in the wrong position, an auth guard is dropped, or a shared cache is accidentally introduced for per-caller cart state.

## Key elements

- **`ALL`** – Array of 10 route signatures (e.g. `'POST /checkout'`, `'PUT /:productId'`). Single source of truth consumed by every `describe` block.
- **`describe('cart routes — what is mounted')`** – Asserts `routeSignatures(router)` matches `ALL` exactly, and that every literal segment (`/summary`, `/checkout`, `/all`, `/shipping-method`) is declared before the parametric `/:productId`.
- **`describe('cart routes — authorization')`** – Iterates `ALL` with `it.each` and asserts `guardsOn(router, sig)` includes `'isAuth'` for every route.
- **`describe('cart routes — caching')`** – Asserts `chainOf(router, 'POST /checkout')` contains `'invalidateCache([products])'`, and that *no* route in `ALL` has a `setCache` entry in its middleware chain.
- **`jest.mock` for `@infrastructure/http/middlewares/cache`** – Replaced with `cacheMock()` so the router can be imported without a live cache backend.

## Relationships

- **`src/modules/cart/routes.ts`** – The system under test; this file imports its exported `router` and inspects its route table, guards, and middleware chains.
- **`tests/support/routes.ts`** – Provides the test-harness utilities `routeTable`, `routeSignatures`, `guardsOn`, `chainOf`, and `cacheMock()`. All assertions in this file are expressed through those helpers.

## Notes

- The ordering test is not cosmetic: Express resolves routes first-match-wins, so declaring `/:productId` before `/all` would silently turn `DELETE /cart/all` into a product-lookup for id `"all"`.
- The "caches nothing" test asserts *absence* as an invariant (a shared, caller-unkeyed cache would leak one shopper's cart to another). It is intentionally written as a positive `toEqual([])` rather than a skip.
- `jest.mock` is hoisted above the `router` import, so the mock is in place before the router module is first evaluated.
