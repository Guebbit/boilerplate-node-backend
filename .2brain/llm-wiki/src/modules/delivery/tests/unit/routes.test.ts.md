---
source: src/modules/delivery/tests/unit/routes.test.ts
source_sha256: 6c7a4a671412541f5e94d2dcbf5412db5aea07e35c9aa276436d41a844a88f0f
context_sha256: 2974e8ddaafca75a95aeca74b87ce49c9b9ea59a937f489a45f3ebd4628e7c99
generated_at: 2026-11-22T05:05:44.686163+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/unit/routes.test.ts

## Purpose
Unit tests that pin down the delivery route table: which endpoints are mounted, in what order, and which guards each one carries. Because guards are set per route rather than inherited, a new route would ship unguarded unless someone remembers to add one. The final "sweep" test exists to catch that.

## Key elements
- `WRITES`: list of the seven `POST`/`PATCH` signatures that write fulfillment orders or shipments. Each is checked with `it.each`.
- **Route list test**: asserts `routeSignatures(router)` equals the exact 14-entry list of endpoints in the documented order.
- **Public methods test**: `GET /methods` must not carry `isAuth`. Shipping cost is pre-purchase information.
- **Order-router read tests**: `GET /:id/fulfillment-orders` and `GET /:id/shipments` on `orderRouter` must have both `isAuth` and `requirePermissionGuard`. The ownership check itself lives in the service, not in the route.
- **Order-router mount test**: `orderRouter` exposes exactly `POST /:id/process`, `GET /:id/fulfillment-orders` and `GET /:id/shipments`. The process door must have `requirePermissionGuard`.
- **Write restriction test**: every `WRITES` entry on `router` must have `requirePermissionGuard`, so only operators can write, not customers.
- **Date-impact preview test**: `release-date-impact` and `restock-date-impact` need `isAuth`. Their permission rows must be exactly `update:Product` followed by `display:Order`, read from `routeTable(router)`.
- **Unauthenticated sweep**: filters all routes lacking `isAuth` and expects only `['GET /methods']`.

## Relationships
- `src/modules/delivery/routes.ts`: exports `router`, the main delivery route table under test.
- `src/modules/delivery/order-routes.ts`: exports `orderRouter`, the routes under `/orders`, tested for its mounted endpoints and guards.
- `tests/support/routes.ts` (imported as `@tests/routes`): supplies the helpers `routeSignatures`, `routeTable` and `guardsOn`, used to introspect routers without making requests.

## Notes
- The tests inspect router metadata (method, path, guard names, permissions) statically. They do not exercise handlers or HTTP.
- Guards are matched by name (`isAuth`, `requirePermissionGuard`), so renaming a guard will break these assertions.
- The module comment says "nine routes", but the route-order test lists 14 entries.
- Adding a route requires updating the exact-list test, and the sweep fails if the new route lacks `isAuth`. A new write route should also be added to `WRITES`.
