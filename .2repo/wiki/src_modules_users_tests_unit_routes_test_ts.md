# src/modules/users/tests/unit/routes.test.ts

## Purpose

Unit test for the users routes router. It asserts that every endpoint is present, correctly ordered, guarded by the full admin middleware chain, and wired with the expected caching and upload behavior. Its job is to catch regressions where a new route is added without the `isAdmin` guard, a cache tag is dropped, or a mutating endpoint forgets to invalidate the shared profile cache.

## Key elements

- **`ALL`** — Ordered list of every documented endpoint signature (`POST /search`, `GET /`, …, `DELETE /:id/2fa`). Serves as the single source of truth for "what should exist."
- **`chainOf(signature)`** — Helper that looks up the middleware chain for one endpoint via `routeTable`. Used throughout the caching and upload assertions.
- **"what is mounted" block** — Verifies the exact endpoint set and that `/search` is mounted before `/:id` (otherwise the parameter route would shadow it).
- **"authorization" block** — For every endpoint in `ALL`, asserts the guard chain contains `getAuth → isAuth → isAdmin` **in that order**. Also asserts no endpoint at all lacks `isAdmin` (no public reads).
- **"caching and uploads" block** — Verifies shared cache key between `GET /` and `POST /search`, the `users` tag on `GET /:id`, that all mutating endpoints invalidate both `users` and `account` cache tags, that image-upload middleware is present on the three create/update routes, and that `DELETE /:id/hard` is gated behind `routeFlag(hardDelete)` while the other delete routes are not.
- **Jest mocks** — `cache`, `route-flag`, and `storage` adapters are replaced with factories from `@tests/routes` so the router can be introspected without real infrastructure.

## Relationships

- **`src/modules/users/routes.ts`** — The module under test. The test imports `router` from it and inspects the mounted middleware table.
- **`tests/support/routes.ts`** — Provides the introspection helpers (`routeTable`, `routeSignatures`, `guardsOn`, `optionsOf`) and the mock factories (`cacheMock()`, `routeFlagMock()`, `storageMock()`) used in the `jest.mock` calls.

## Notes

- The test asserts **guard ordering**, not just presence. A chain of `[isAdmin, getAuth, isAuth]` would fail even though all three are present, because `isAdmin` would read `req.user` before `getAuth` populates it.
- The leading JSDoc `@module` block is actually a description of the **routes** module's invariant (admin-only by a single `router.use`). It lives in the test file as documentation but reads as a note about `routes.ts`.
- Cache invalidation asserts both `users` **and** `account` tags because the same row is served by two separate route trees; missing either tag leaves a stale profile in one of them.
- `keyParameters` on the shared listing cache is asserted to be non-empty, ensuring the cache key varies by query (e.g. search term) rather than being a single flat key.
