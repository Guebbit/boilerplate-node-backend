# src/modules/cart/tests/unit/routes.test.ts

## Purpose

Unit test for the cart router's route table. It verifies that the cart module exposes exactly the expected endpoints in the correct declaration order (critical for Express first-match semantics), that every route is authenticated with `isAuth` but never `isAdmin`, and that no route sets a shared cache while `POST /checkout` does invalidate the orders/products caches.

## Key elements

- **`ALL`** — canonical list of all eight cart route signatures (method + path) that the router must expose.
- **`chainOf(signature)`** — helper that looks up the middleware chain for a single route by matching its `"METHOD /path"` string against `routeTable(router)`.
- **`describe('cart routes — what is mounted')`** — asserts the full endpoint list and that literal-segment paths (`/summary`, `/checkout`) are declared before the `/:productId` wildcard.
- **`describe('cart routes — authorization')`** — asserts `isAuth` on every route and the *absence* of `isAdmin` on any route (a cart is per-caller by design).
- **`describe('cart routes — caching')`** — asserts `POST /checkout` includes an `invalidateCache([orders|products])` step and that no route calls `setCache` (a shared cache would leak one shopper's cart to another).

## Relationships

- **`src/modules/cart/routes.ts`** — the module under test; this file imports its `router` export and asserts against its mounted routes.
- **`tests/support/routes.ts`** — provides the `routeTable`, `routeSignatures`, and `guardsOn` helpers that inspect an Express router's middleware chain in a test-friendly way. Also supplies the `cacheMock()` factory used in the `jest.mock` call.

## Notes

- The `jest.mock` for the cache middleware is hoisted above the `import { router }`, so the router is built with the mocked cache middleware in place. The mock delegates to `routeSignatures`/`guardsOn`-compatible chain entries (e.g. the string `'invalidateCache([orders|products])'`), meaning assertions match on *named* entries rather than real function references.
- The ordering test (`/summary` and `/checkout` before `/:productId`) is not just a style check: Express resolves routes in declaration order, so a regression that reorders them would silently turn `GET /cart/summary` into a product-lookup for id `"summary"`.
- The "no `setCache` anywhere" assertion encodes a *negative* invariant. It exists so that adding a cache-write to any cart route fails the suite and forces a deliberate review, rather than being an implicit assumption.
