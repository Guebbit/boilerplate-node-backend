# src/modules/wishlist/tests/unit/routes.test.ts

## Purpose

Unit test for the wishlist router. It pins down four invariants: the exact set and order of endpoints, universal session auth, the deliberate absence of any admin guard, and the route-declaration ordering that prevents `move-to-cart` from being swallowed by the `/:productId` param match.

## Key elements

- **`describe('wishlist routes')`** — single top-level block; no sub-suites.
- **Endpoint signature test** — asserts `routeSignatures(router)` equals exactly `['GET /', 'POST /', 'POST /:productId/move-to-cart', 'DELETE /:productId']` in that order.
- **Auth guard test (`it.each`)** — iterates every signature and asserts `guardsOn` includes `'isAuth'`.
- **Admin-free test** — filters all signatures for an `'isAdmin'` guard and asserts the result is empty. Comments in-file explain this is a deliberate tripwire: adding an operator view of a user's wishlist will fail this test and force review.
- **Ordering test** — uses `routeTable(router)` to extract path strings and asserts `indexOf('/:productId/move-to-cart')` is less than `indexOf('/:productId')`.

## Relationships

- **`src/modules/wishlist/routes.ts`** — the SUT. Imports `router` and tests its mounted routes, guards, and declaration order.
- **`tests/support/routes.ts`** — provides the three test helpers consumed here: `routeTable` (raw mount table with `path`), `routeSignatures` (formatted `"METHOD /path"` list), and `guardsOn` (guard names for a given signature).

## Notes

- The ordering invariant is the most fragile assertion: if a new `/:productId/…` sub-route is added, it must still be declared before the bare `/:productId` route, or the existing order test will fail.
- The admin-free test is intentionally a *negative* assertion. A passing test means "nothing changed"; a failing test is a signal to review the diff, not a bug to fix by relaxing the expectation.
