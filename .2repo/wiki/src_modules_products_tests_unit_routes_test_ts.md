# src/modules/products/tests/unit/routes.test.ts

## Purpose
Unit test for the product catalogue's Express router. It guards against three silent regressions: an admin guard disappearing from a write route (making mutations public), static paths like `/search` being shadowed by `/:id` due to mount order, and a cache-tag rename that breaks invalidation. It asserts on middleware *arguments* rather than HTTP behaviour, because Express only retains closures and the substance lives in the factory calls.

## Key elements
- **`TAG`** – Single constant (`'products'`) for the cache tag; used in reader-side assertions. Invalidations are checked against the *literal* string so a rename fails here rather than tracking the constant.
- **`chainOf(signature)`** – Looks up the middleware chain for a `"METHOD /path"` string in the flattened route table.
- **`WRITES`** – Array of the six mutation signatures, reused across authorization and caching blocks.
- **`jest.mock` blocks** – Replace `@infrastructure/http/middlewares/cache`, `@infrastructure/http/middlewares/route-flag`, and `@infrastructure/adapters/storage` with mock factories sourced from the test-support module, so the test can read the arguments passed at mount time.
- **`describe` blocks** – "what is mounted" (full signature list + ordering + router-level `getAuth`), "authorization" (per-write `isAuth`→`isAdmin` order; per-read absence of both), "caching" (shared `keyAs` for listings, tag presence on readers, `invalidateCache` on writers), "uploads and flags" (multer field name, validation chain, `routeFlag(hardDelete)` only on the `/hard` route).

## Relationships
- **`src/modules/products/routes.ts`** – The module under test. This file imports its `router` export and asserts on the middleware chains it mounts.
- **`tests/support/routes.ts`** – Supplies `routeTable`, `routerMiddleware`, `routeSignatures` (test helpers that flatten an Express router into inspectable rows) and the three mock factories (`cacheMock`, `routeFlagMock`, `storageMock`) that the `jest.mock` calls delegate to via `jest.requireActual`.

## Notes
- Invalidation assertions compare against the *literal* `'products'` string, not the `TAG` constant, deliberately. A rename in production code must break this test; using the shared constant would silently pass.
- The "exactly the documented endpoints" test asserts the full ordered list at once—by design, a per-route check cannot prove nothing extra is mounted.
- `DELETE /:id` and `DELETE /:id/hard` share a handler; the test's only differentiator is the presence of `routeFlag(hardDelete)` on the `/hard` route.
- Mocks are injected by resolving the *test-support* module with `jest.requireActual`, not the infrastructure path—this couples the mock implementations to the support file rather than to the real middleware signatures.
