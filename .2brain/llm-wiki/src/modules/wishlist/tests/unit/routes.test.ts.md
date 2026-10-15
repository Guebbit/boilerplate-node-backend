---
source: src/modules/wishlist/tests/unit/routes.test.ts
sha256: 727dace6166f6fa8149dde666d369e27ce75f124831cfd02fa487e0e6c3a7dc1
generated_at: 2026-10-15T12:28:53.016010+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/unit/routes.test.ts

## Purpose

Unit test that pins down the wishlist router's contract: the exact set and order of endpoints, the auth guard on every route, the single permission guard (only on the move-to-cart write), and the declaration order that prevents a path-param collision between `/:productId/move-to-cart` and the bare `/:productId` routes.

## Key elements

- **`routeSignatures(router)`** – extracted from `@tests/routes`; flattens the router into an ordered array of `"METHOD /path"` strings for comparison.
- **`guardsOn(router, signature)`** – extracted from `@tests/routes`; returns the guard names attached to a given route signature.
- **`routeTable(router)`** – extracted from `@tests/routes`; returns the raw route definitions (used here to inspect `path` ordering directly).
- **`router`** – the actual Hono router imported from `@modules/wishlist/routes`; the sole SUT.
- **Four `it` blocks** inside `describe('wishlist routes')`:
  1. Exact signature + order assertion.
  2. `it.each` over all four signatures: each must include `isAuth`.
  3. Filters signatures carrying `requirePermissionGuard`; asserts only `POST /:productId/move-to-cart` matches.
  4. Index comparison proving `/:productId/move-to-cart` is declared before `/:productId`.

## Relationships

- **`src/modules/wishlist/routes.ts`** — the file under test; provides the `router` that every assertion inspects.
- **`tests/support/routes.ts`** — supplies the three introspection helpers (`routeTable`, `routeSignatures`, `guardsOn`) used throughout; imported via the `@tests/routes` alias.

## Notes

- The ordering test (item 4) guards against a real routing bug: if `/:productId` is declared first, a request to `/:productId/move-to-cart` is captured by the shorter pattern and the product id becomes the literal string `"move-to-cart"`.
- The file enforces an *admin-free* invariant: no route carries an admin/operator guard. The only permission guard present is the shopper's key on the basket-write endpoint.
- The `@tests/routes` import alias resolves to `tests/support/routes.ts`, not a package — keep this in mind when tracing dependencies.
