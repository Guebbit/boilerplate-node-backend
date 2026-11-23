---
source: src/modules/products/tests/unit/routes.test.ts
source_sha256: f2713a0816bd8dbb8dba70d0c9f4d245ea68b12372676c967b2f81372495389e
context_sha256: e4feb3966798e2c952ad96fdc0a57eb6a0c918bcc35b92eed1314d57dd7c562f
generated_at: 2026-11-22T07:19:41.865224+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/unit/routes.test.ts

## Purpose
Unit test for the product catalogue's route table. It guards against failures a type checker can't catch: a dropped admin guard, a static path such as `/search` shadowed by a later `/:id`, or a cache tag renamed on the writer but not the reader. It inspects the router's middleware chains and never issues HTTP requests.

## Key elements
- **Helper imports from `@tests/routes`**: `routeTable`, `routerMiddleware`, `routeSignatures`, `optionsOf`, `identityGuardIndex` and `chainOf`. They read the router's structure: route rows with `method`, `path` and `chain`, router-level middleware, and the options of a named middleware.
- **Middleware mocks**: the `cache`, `route-flag` and `upload` middleware modules under `@infrastructure/http/middlewares/` are replaced with `cacheMock()`, `routeFlagMock()` and `storageMock()` from `@tests/routes`. Each is loaded through `jest.requireActual`. The mocks are what make the chain entries readable as strings such as `setCache(3600…`, `invalidateCache([products])` and `routeFlag(hardDelete)`.
- **`TAG`**: the `'products'` cache tag, declared once.
- **Test groups**:
  - **What is mounted**:
    - The exact list of 10 `METHOD path` signatures, in order, so nothing extra can be mounted.
    - `/search` and `/facets` are declared before `/:id`.
    - `getAuth` is mounted at router level.
  - **Browser re-checks every read**: `GET /:id`, `GET /` and `POST /search` set `setCache` options `tags: [TAG]` and `browserRevalidate: true`.
  - **Authorization**:
    - Writes (`POST /`, `PUT /:id`, `PATCH /:id`, `DELETE /:id`, `DELETE /:id/hard`) must have an identity guard before `requirePermissionGuard`.
    - `POST /`, `PUT /:id` and `PATCH /:id` must carry exactly two `requirePermissionGuard` entries (products and translations keys).
    - `POST /search`, `GET /`, `GET /facets` and `GET /:id` must have no identity guard and no permission guard.
  - **Caching**:
    - `GET /` and `POST /search` share an identical `setCache` entry, with `keyAs` of `products:search`, non-empty `keyParameters` and a 3600 TTL.
    - `previewDraftLanguage` precedes `setCache` on `GET /`, `POST /search` and `GET /:id`.
    - `GET /facets` and `GET /:id` are cached under the tag.
    - Every write route contains `invalidateCache([products])`.
  - **Uploads and flags**:
    - `POST /`, `PUT /:id` and `PATCH /:id` include `upload.image`, `validateUploadedImages` and `quarantineUploadedImages`.
    - `DELETE /:id/hard` has `routeFlag(hardDelete)` and `DELETE /:id` does not.

## Relationships
- **`src/modules/products/routes.ts`**: provides the `router` under test. The suite imports it after the middleware mocks are registered, so the router is built against the mocked middleware factories.
- **`tests/support/routes.ts`** (aliased `@tests/routes`): supplies the router-introspection helpers and the three middleware mocks. The file's header points there for why the factories are mocked.

## Notes
- The mock registrations must stay above the router import. The mocks are what turn middleware into inspectable string labels.
- The invalidation test hard-codes the literal `invalidateCache([products])` through `TAG`, and a comment says this is deliberate. A tag rename on the readers or writers should fail the test, not be followed silently.
- The `routeSignatures` test lists routes in full and in order on purpose, so it also catches added or reordered routes.
- `POST /search` is cached through the same declaration as the list. The test comment says `setCache` answers it `no-store`.
- `getAuth` is asserted at router level, not per route. The comments explain that admins see soft-deleted products on `GET /:id` only because it runs.
- The `GUARDED` constant has a dangling comment, `/** Everything that changes catalogue state, */`, which ends mid-sentence.
