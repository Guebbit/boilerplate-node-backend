# src/modules/orders/tests/unit/routes.test.ts

## Purpose

Unit test for the orders router that pins down three structural invariants: the exact endpoint list and ordering, the auth-guard split (router-level `isAuth` + per-route `isAdmin`), and the caching/invalidation strategy. It exists to prevent silent regressions where an omitted guard, reordered path, or wrong cache key would change authorization or invalidate scope without a visible logic change.

## Key elements

- **`chainOf(signature)`** — resolves the middleware chain for a `"METHOD /path"` string via the `routeTable` helper; used by every caching assertion.
- **`describe('order routes — what is mounted')`** — asserts the exact 11-route list and enforces that `/search` and `/:id/invoice` appear before `/:id` (shadow-safety + readability convention).
- **`describe('order routes — authorization')`** — verifies `isAuth` on every route (proving the `router.use` covers all), `isAdmin` on the six admin writes, and that `POST /:id/cancel` and the four read routes are **not** admin-guarded.
- **`describe('order routes — caching')`** — checks shared cache key/tag/TTL for listings, per-resource caching for detail routes, the deliberate asymmetry in invalidation (`[orders|products]` only on create + cancel), and that `routeFlag(hardDelete)` gates only `DELETE /:id/hard`.
- **Mocks** — `cache` and `route-flag` middlewares are mocked via factories exposed from the test-support module so chain strings are inspectable.

## Relationships

- **`src/modules/orders/routes.ts`** — the SUT; this file imports its `router` export and asserts its structure.
- **`tests/support/routes.ts`** — provides the `routeTable`, `routeSignatures`, `guardsOn` helpers and the `cacheMock` / `routeFlagMock` factories consumed by the `jest.mock` calls above.

## Notes

- The `jest.mock` bodies call `jest.requireActual` to pull mock factories out of the test-support file — a pattern that keeps the mock definitions co-located with the helpers while still satisfying Jest's hoisting requirement.
- `POST /:id/cancel` lacking `isAdmin` is an intentional feature (customer self-cancel), not a gap. A test "fixing" it would remove the feature; the negative assertion is the guard against that.
- Cache invalidation deliberately clears `products` only where stock changes (create, cancel). Edit/delete invalidate `orders` alone; the test asserts that asymmetry to prevent a needless stampede regression.
- Route ordering is asserted because `/search` (one segment) genuinely shadows `/:id`; `/:id/invoice` is two-segment and cannot be shadowed, but the assertion keeps the stated convention from silently decaying.
