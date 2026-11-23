---
source: src/modules/addresses/tests/unit/routes.test.ts
source_sha256: b2927ab6aec04fc66085880c1b0c78ed464d3a574a82d4ab722f184188e9ca63
context_sha256: d5d3ce0b25100c99d352d7d44ff957da86d404cefa17ad192f77fe9ea519c7ae
generated_at: 2026-11-22T04:17:18.282430+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/tests/unit/routes.test.ts

## Purpose
Unit test that pins the route table of the addresses router. It checks which endpoints are mounted and in what order, that router-wide middleware is applied, and that every route is session-protected, no-store, uncached, and free of permission keys or credential rate limiting. The addresses router shares the `/account` prefix with the account module's router, so it must be covered by `getAuth`/`noStore` in the same way.

## Key elements
- **`describe('what is mounted')`**
  - Asserts the exact ordered list of route signatures: `GET /addresses`, `POST /addresses`, `GET`/`PUT`/`PATCH /addresses/:addressId`, `PUT /addresses/:addressId/default`, `DELETE /addresses/:addressId`.
  - Asserts the router-level middleware is exactly `['getAuth', 'noStore']`.
  - Uses `it.each` to assert that every route has `noStore` in its guards. This catches a route mounted above `router.use(noStore)`.
- **`describe('authorization')`**
  - Every route's guards must include `isAuth`.
  - No route may include `requirePermissionGuard`, because every route is the caller acting on their own rows.
- **`describe('no unexpected middleware')`**
  - No route's chain may contain an entry starting with `credentials-`. The global rate limit covers this module.
  - No route's chain may contain an entry starting with `setCache`.
- **Cache mock** — `jest.mock` of `@infrastructure/http/middlewares/cache`, implemented with `cacheMock()` from `@tests/routes`.

## Relationships
- **`src/modules/addresses/routes.ts`** — the module under test. Its exported `router` is imported after the cache mock is registered.
- **`tests/support/routes.ts`** (`@tests/routes`) — supplies the helpers `routeSignatures`, `routerMiddleware`, `guardsOn` and `chainOf` for inspecting the router, plus `cacheMock`, which the middleware mock uses.
- The file also references `@modules/account/routes` in its header comment as the sibling router on the same `/account` prefix. It does not import it.

## Notes
- The `jest.mock` call comes before the router import, so the router is built with the mocked cache middleware.
- The `it.each` titles are generated from the router's own signatures. A new route is therefore checked for `noStore` and `isAuth` automatically, but the "what is mounted" test fails until its expected list is updated.
