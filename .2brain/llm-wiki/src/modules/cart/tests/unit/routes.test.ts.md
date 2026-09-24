---
source: src/modules/cart/tests/unit/routes.test.ts
sha256: 303f60a340451b5cdef21bf430bee27812f1e60c23a6a9a6e223aa8d7e37c6af
generated_at: 2026-09-23T18:34:54.203072+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/routes.test.ts

## Purpose

Unit test that locks down the cart router's observable contract: the exact set of endpoints, their declaration order, per-route authorization, and caching behavior. It exists so that a future reordering or guard removal is caught immediately rather than in production.

## Key elements

- **`ALL`** – Array of the nine expected `METHOD /path` signatures; single source of truth for "what the cart exposes."
- **`describe('cart routes — what is mounted')`** – Asserts `routeSignatures(router)` equals `ALL` and that literal segments (`/summary`, `/checkout`, `/all`) are declared before `/:productId` (Express first-match semantics).
- **`describe('cart routes — authorization')`** – Iterates `ALL` with `it.each`, asserting every route includes an `isAuth` guard.
- **`describe('cart routes — caching')`** – Two assertions: `POST /checkout` invalidates `orders` and `products` caches; **no** route in `ALL` calls `setCache` (a shared cart cache would leak one shopper's state to another).
- **`jest.mock('@infrastructure/http/middlewares/cache')`** – Replaces the cache middleware with `cacheMock()` from the test-support module so tests run without a live cache layer.

## Relationships

- **Imports `router`** from `src/modules/cart/routes.ts` — the system under test.
- **Imports `routeTable`, `routeSignatures`, `guardsOn`, `chainOf`** from `tests/support/routes.ts` — shared route-introspection helpers that walk the Express router's internal layer stack.
- **Mocks `@infrastructure/http/middlewares/cache`** via the `cacheMock` factory exported by `tests/support/routes.ts`, decoupling assertions from the real cache implementation.

## Notes

- The ordering test is not stylistic: if `/:productId` were declared before `/summary`, `/checkout`, or `/all`, Express would match the parameterised route first and the literal endpoints would 404. The test encodes that constraint.
- The "caches nothing" test asserts an **absence** (`expect(cached).toEqual([])`) deliberately — the invariant is that no route opts into shared caching, because cart state is per-caller.
- Only `/checkout` is expected to touch the external cache (orders, products); every other route is read-or-write-within-cart and therefore needs no invalidation.
