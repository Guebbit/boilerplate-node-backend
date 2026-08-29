# src/modules/delivery/tests/unit/routes.test.ts

## Purpose
Unit test for the delivery route table. It verifies that exactly three endpoints are mounted in the documented order, that each carries the correct authentication guard, and that no route is accidentally left unauthenticated. The file exists to catch the specific drift risk of a new route being added without a guard.

## Key elements
- **`describe('delivery routes')`** — the single test suite; five `it` blocks cover the full contract.
- **Order/shape test** — asserts `routeSignatures(router)` equals `['GET /methods', 'GET /order/:orderId', 'POST /advance']` in that exact sequence.
- **Per-route guard assertions** — `GET /methods` must *not* have `isAuth`; `GET /order/:orderId` must have `isAuth` but *not* `isAdmin`; `POST /advance` must have `isAdmin`.
- **Sweep test** — filters all route signatures for those lacking `isAuth` and asserts the result is exactly `['GET /methods']`. Any new unguarded route fails here.

## Relationships
- **`src/modules/delivery/routes.ts`** — provides the `router` instance under test; this file reads its mounted routes and middleware without invoking handlers.
- **`tests/support/routes.ts`** — provides the `routeSignatures(router)` and `guardsOn(router, signature)` helpers that this test (and presumably other route tests) rely on to introspect a router's table.

## Notes
- Guards are deliberately per-route (not an inherited default), so the sweep test is the only structural safety net against a new route shipping open.
- The file uses path aliases `@modules/delivery/routes` and `@tests/routes`; no direct relative imports.
- Test comments encode the *why* (public pricing, ownership gating, operator-only bulk advance) — treat them as the spec's rationale when modifying the route table.
