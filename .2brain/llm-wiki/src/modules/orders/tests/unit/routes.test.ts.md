---
source: src/modules/orders/tests/unit/routes.test.ts
source_sha256: 196e568dd86ea2807daa121a5f903a388437c7c5548b3881309d6b3b613bf189
context_sha256: dfc7a8590ba6232f11bebe2569d417c4f624b23f68d415c37230b6023a7704cf
generated_at: 2026-11-22T06:37:37.348088+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/routes.test.ts

## Purpose
Unit test that pins the orders route table in `src/modules/orders/routes.ts`: which endpoints are mounted and in what order, which guards (authentication, permission) sit on each, how the export and note budgets are ordered, and which caching headers or middleware each read and write uses. It exists so that a missing `requirePermission`, which would silently read as "any authenticated user may do this", or a reordered route fails a test.

## Key elements
- **Imports from `@tests/routes`**: `routeTable`, `routeSignatures`, `guardsOn` and `chainOf` inspect the router. `cacheMock`, `routeFlagMock` and `securityMock` are used inside the `jest.mock` factories.
- **`jest.mock` calls** for the `cache`, `route-flag` and `rate-limit` middlewares. They are replaced with the shared test mocks, so the middleware chain has readable names such as `isAuth`, `requirePermissionGuard`, `privateNoCache`, `noStore`, `orders-export`, `orders-note` and `routeFlag(hardDelete)`.
- **`what is mounted`**:
  - The exact list of 17 `METHOD /path` signatures, in order.
  - `/search` and `/export` must be declared before `/:id`. Otherwise `requireId` would answer 404 for the word `export`.
- **`authorization`**:
  - Every listed route has `isAuth`.
  - `GET /export`, `POST /`, `PUT /:id`, `PATCH /:id`, `DELETE /:id` and `DELETE /:id/hard` have `requirePermissionGuard`.
  - `POST /:id/override-status` has `requirePermissionGuard` as well. The test comment says it uses its own `override:Order` key, separate from the ordinary write permission.
  - `POST /:id/cancel`, `POST /search`, `GET /` and `GET /:id` must NOT have `requirePermissionGuard`. They are scoped in the service instead.
- **`the export budget`**: on `GET /export`, `orders-export` comes after `requirePermissionGuard` in the chain.
- **`staff notes`**: `POST /:id/timeline/notes` and `DELETE /:id/timeline/notes/:eventId` need `requirePermissionGuard`. For POST, `orders-note` comes after the permission guard.
- **`caching`**:
  - `GET /` and `GET /:id` use `privateNoCache` and no `setCache*` entry.
  - `POST /search` uses `noStore`.
  - `POST /` and `POST /:id/cancel` do not call `invalidateCache([products])`.
  - `DELETE /:id/hard` goes through `routeFlag(hardDelete)`, and `DELETE /:id` does not.

## Relationships
- Imports `router` from `src/modules/orders/routes.ts`, the unit under test. Only the route table and middleware chain are inspected.
- Uses the helpers and mock factories in `tests/support/routes.ts` (via the `@tests/routes` alias) to list routes, read their guards and build the middleware mocks.

## Notes
- The `jest.mock` calls are declared before the `router` import, so the middleware mocks are in place when the route module loads.
- `POST /:id/cancel` is intentionally not admin-guarded, so a customer can cancel their own order. Safety comes from the service's scoped conditional write, which is covered by `service-scope.test.ts` and `cancel.test.ts` (per the test comments).
- The `isAuth` assertion confirms the router-level `router.use(getAuth, isAuth)` covers every route, including routes added later.
- `GET /:id/invoice` and `/credit-note` are not in this table. The `invoicing` module mounts its own router at the same `/orders` basePath, tested in `src/modules/invoicing/tests/unit/routes.test.ts`.
- Some routes are not checked for guards. `PUT /:id/shipping-address`, `PUT /:id/billing-address`, `POST /:id/restore` and `DELETE /:id/timeline/notes/:eventId` appear in the signature list but have no `isAuth` or admin-guard assertion, apart from the notes routes above.
