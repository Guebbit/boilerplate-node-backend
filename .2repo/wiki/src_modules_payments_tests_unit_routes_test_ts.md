# src/modules/payments/tests/unit/routes.test.ts

## Purpose

Unit tests that pin down the payments router's route table as a security contract: the exact set and order of endpoints, universal session authentication, and the single admin-only route (refund). The file exists so that a future edit accidentally opening or closing a route, or reordering them into a shadowing collision, is caught immediately.

## Key elements

- **`describe('payment routes')`** — top-level suite; no custom setup/teardown, relies entirely on the imported `router`.
- **`'mounts exactly the documented endpoints, in the documented order'`** — asserts `routeSignatures(router)` equals the four expected signatures in order.
- **`it.each(routeSignatures(router))('%s requires a session', …)`** — parametrised check that every route carries the `isAuth` guard.
- **`'admin-guards the refund, and only the refund'`** — filters routes for an `isAdmin` guard and asserts the result is exactly `['POST /order/:orderId/refund']`.
- **`'declares the refund before the bare /:id route'`** — asserts the three-segment refund path appears earlier in the array than the two-segment `/:id/confirm` path.

## Relationships

- **`src/modules/payments/routes.ts`** — system under test; this file imports its named `router` export.
- **`tests/support/routes.ts`** — provides the two introspection helpers `routeSignatures` and `guardsOn` used to extract signatures and guard names from the router instance.

## Notes

- The file's own doc-comment frames the design intent: "exactly one route is additionally admin-only: the refund." The test suite operationalises that sentence; the admin-guard test and the `toEqual` (not `toContain`) make it a closed-world assertion.
- The ordering test is deliberately forward-looking: today the two paths can't collide (different segment counts), but the assertion locks in the convention so a future two-segment admin route won't be silently shadowed by `/:id/confirm`.
- No mocking or HTTP calls — the tests are purely structural introspection of the router object.
