---
source: src/modules/stats/tests/unit/routes.test.ts
source_sha256: 2fc6284f4511cad7c1de738c2fd4a8b42b5a9fd2c395ec583dc56b99845b91a9
context_sha256: 5784011232b3feb1b697cbaabfd1e3542d85f85d1c668b3382c6e2cc683cf883
generated_at: 2026-11-22T07:53:17.894017+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/tests/unit/routes.test.ts

## Purpose
Unit test that pins the stats router's route table. It asserts that the module exposes exactly eight read-only GET routes, that every route requires a session, and that every route is guarded by the single permission `read:Stats`. Its stated aim is that adding a write, a public route, or a different permission becomes a deliberate decision rather than an accident.

## Key elements
- **`mounts exactly the documented reads, all GET`**: compares `routeSignatures(router)` to an ordered list: `GET /sales`, `/products`, `/products/:productId`, `/categories`, `/payments`, `/operations`, `/customers`, `/pipeline`.
- **`%s requires a session`** (`it.each` over every signature): checks that `guardsOn(router, signature)` contains `isAuth`.
- **`guards every route on the one rule`**: maps `routeTable(router)` permissions to `action:subject` strings and expects `read:Stats` for each of the 8 routes.
- **`jest.mock` of `@infrastructure/http/middlewares/rate-limit`**: replaced with `securityMock()` from `@tests/routes`, loaded through `jest.requireActual`.

## Relationships
- **`src/modules/stats/routes.ts`**: provides the `router` under test, imported from `@modules/stats/routes`.
- **`tests/support/routes.ts`**: imported as `@tests/routes`. It supplies the helpers `routeSignatures`, `routeTable`, `guardsOn` and the `securityMock` used to stub the rate-limit middleware.

## Notes
- The `jest.mock` call comes before the `router` import so the router is built with the mocked rate-limit middleware.
- The expected signature list is order-sensitive, so reordering routes in the router will fail the first test.
- The hardcoded `length: 8` in the permission test must be updated together with the route list when routes are added or removed.
