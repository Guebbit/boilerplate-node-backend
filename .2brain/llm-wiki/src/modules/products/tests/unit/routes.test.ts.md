---
source: src/modules/products/tests/unit/routes.test.ts
sha256: 54f416fa50d506671972e2b212ea9f8994f21d0330cebf2a6fc7b0a82e30fcc7
generated_at: 2026-09-23T19:30:51.660191+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/routes.test.ts

## Purpose

Guards the product catalogue's Express route table against regressions that the TypeScript compiler cannot detect: a silently dropped admin guard, a static path shadowed by a later `/:id` param, a cache tag renamed on the writer but not the reader, or an upload field rename that makes multer ignore the file. The assertions are written as whole-table checks rather than per-route spot checks so that an _unexpected extra_ mount or a _reordered_ guard is also caught.

## Key elements

- **`TAG`** – Local constant `'products'`; stated once so a cache-tag rename has a single place to fail in the reader-side tests.
- **`describe('product routes — what is mounted')`** – Asserts the exact ordered list of `routeSignatures`, verifies static segments (`/search`, `/categories`) precede `/:id`, and confirms `getAuth` is at the router level (not per-route).
- **`describe('product routes — authorization')`** – For every mutating/admin route, asserts an identity guard precedes `requirePermissionGuard`; verifies `POST /` and `PATCH /:id` stack _two_ permission guards (products + translations); verifies all read routes carry _no_ identity guard.
- **`describe('product routes — caching')`** – Asserts `GET /` and `POST /search` share the same `setCache` key (`products:search`) with non-empty `keyParameters`; asserts `GET /categories` and `GET /:id` carry the `products` tag; asserts every write route calls `invalidateCache([products])`.
- **`describe('product routes — uploads and flags')`** – Verifies `upload.single(imageUpload)` is present on write routes, followed by `validateUploadedImages` and `quarantineUploadedImages`; verifies `routeFlag(hardDelete)` appears only on `DELETE /:id/hard` and is _absent_ from the soft-delete and bulk-delete routes.
- **`jest.mock` calls (×3)** – Replace `@infrastructure/http/middlewares/{cache,route-flag,upload}` with factories supplied by `@tests/routes` (`cacheMock`, `routeFlagMock`, `storageMock`) so the route table can be inspected without booting real infrastructure.

## Relationships

- **`src/modules/products/routes.ts`** – The module under test. This file imports its `router` export and inspects every property of that Express Router instance (mounted paths, middleware chains, per-route options).
- **`tests/support/routes.ts`** – Source of every inspection helper (`routeTable`, `routerMiddleware`, `routeSignatures`, `optionsOf`, `identityGuardIndex`, `chainOf`) and of the three mock factories referenced inside the `jest.mock` factories. Without it, no assertion in this file could run.

## Notes

- The `jest.mock` factories call `jest.requireActual('@tests/routes')` (not the real infrastructure path) so that the mock definitions live alongside the helpers, not in `__mocks__` directories.
- Several assertions deliberately use **literal strings** (`'products'`, `'imageUpload'`, `'hardDelete'`) rather than importing the source constants. The comment in the invalidation test makes the intent explicit: a rename in `routes.ts` must _fail_ here instead of silently following the new name.
- The ordering assertion (`indexOf('/search') < indexOf('/:id')`) exists because Express resolves routes in mount order; a param route mounted before a literal segment makes the literal unreachable.
- `identityGuardIndex` returning `-1` means "no identity guard found"; the public-route tests assert this explicitly rather than asserting the chain is empty, so a future non-identity middleware addition does not break the test.
