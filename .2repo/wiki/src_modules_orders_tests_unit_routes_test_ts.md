# src/modules/orders/tests/unit/routes.test.ts

## Purpose
Unit test for the orders router's route table. It verifies the exact set and order of mounted endpoints, that auth guards (`isAuth`, `isAdmin`) are applied where expected (and intentionally absent where a customer-facing write must remain open), and that caching and invalidation middleware match the documented behavior.

## Key elements
- **`chainOf(signature)`** — local helper that resolves a `METHOD /path` string to its mounted middleware chain via `routeTable`.
- **`describe('order routes — what is mounted')`** — asserts the exact endpoint list and ordering; specifically that `/search` and `/:id/invoice` appear before `/:id` (shadowing guard + convention guard).
- **`describe('order routes — authorization')`** — asserts `isAuth` is present on every route (router-level `use`), `isAdmin` on the six admin-only writes, absence of `isAdmin` on `POST /:id/cancel`, and absence of `isAdmin` on read routes.
- **`describe('order routes — caching')`** — asserts shared cache key (`orders:search`) and 3600 s TTL for both listings, per-resource caching under the `orders` tag, that only stock-affecting routes (`POST /`, `POST /:id/cancel`) also invalidate the `products` tag, and that `DELETE /:id/hard` is gated behind `routeFlag(hardDelete)` while the soft deletes are not.
- **Mocks** — `@infrastructure/http/middlewares/cache` and `@infrastructure/http/middlewares/route-flag` are replaced with `cacheMock()` / `routeFlagMock()` from the test support module.

## Relationships
- **`src/modules/orders/routes.ts`** — the file under test; its `router` export is the sole SUT. Every assertion reads the mounted chain off that router.
- **`tests/support/routes.ts`** — supplies all inspection helpers (`routeTable`, `routeSignatures`, `guardsOn`, `optionsOf`) and the two factory mocks (`cacheMock`, `routeFlagMock`). The test never touches real middleware logic.

## Notes
- The absence of `isAdmin` on `POST /:id/cancel` is an **assertion, not an oversight**: its safety lives in the service-layer scope (`orderService.cancelById`), covered separately by `service-scope.test.ts` / `cancel.test.ts`. Adding the guard here would silently remove a customer feature.
- The `/:id/invoice` ordering assertion is a **convention guard**, not a functional one (two-segment path cannot be shadowed by `/:id`). It exists to prevent the stated "specific-before-parameter" convention from decaying silently.
- `keyParameters` length check ensures the listing cache key is parameterized (varies per caller/query), not a single static key.
- Invalidation asymmetry (products tag only on create/cancel) is deliberate; adding it to edit/delete would cause needless cache stampedes since those paths don't touch stock.
