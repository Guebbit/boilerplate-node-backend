# src/modules/wishlist/tests/unit/routes.test.ts

## Purpose

Unit tests that pin the wishlist router's contract: the exact set and order of registered routes, the authentication requirement on every route, the deliberate absence of any admin guard, and the path-ordering constraint that keeps `/:productId/move-to-cart` from being shadowed by the bare `/:productId` route.

## Key elements

- **`describe('wishlist routes')` block** — four `it` cases:
  - *mounts exactly the documented endpoints, in the documented order* — asserts `routeSignatures(router)` returns the four expected signatures in sequence.
  - *`%s requires a session`* (parameterized via `it.each`) — asserts every route carries the `isAuth` guard.
  - *is admin-free by design* — asserts no route includes an `isAdmin` guard; a future admin endpoint would fail this test by design.
  - *declares move-to-cart before the bare /:productId route* — uses `routeTable` to extract raw path strings and checks index ordering.

## Relationships

- **`src/modules/wishlist/routes.ts`** — the module under test. Imported as `@modules/wishlist/routes` to get the `router` instance that every assertion inspects.
- **`tests/support/routes.ts`** — provides the three introspection helpers (`routeTable`, `routeSignatures`, `guardsOn`) imported from `@tests/routes`. These are the only way this file reads the router's internals without hitting an HTTP server.

## Notes

- The ordering test exists because Express-style routers match paths top-to-bottom; if `/:productId` were registered first, the literal string `move-to-cart` would be captured as a product id. The test fails fast on any reordering.
- The "admin-free" test is intentionally a guard against scope creep: any future operator-facing wishlist endpoint will break the build until someone explicitly updates the test and justifies the change.
- All four endpoints are listed inline in two places (the signature test and the `it.each` array). If the route set changes, both spots must be updated in lockstep.
