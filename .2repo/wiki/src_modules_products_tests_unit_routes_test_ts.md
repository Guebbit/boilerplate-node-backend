# src/modules/products/tests/unit/routes.test.ts

## Purpose

Route-table contract test for the product catalogue router. It asserts the full set of mounted endpoints, their order, middleware chains, cache configuration, upload handling, and flag-gating — catching silent regressions (dropped guards, path shadowing, cache-tag drift, ignored upload fields) that TypeScript's type system cannot express.

## Key elements

- **`chainOf(signature)`** — helper that resolves a `"METHOD /path"` string to the middleware chain mounted on that endpoint via `routeTable(router)`.
- **`TAG = 'products'`** — single declaration of the catalogue cache tag; used in reader assertions while writer assertions use the literal string so a rename fails the test rather than following along.
- **"what is mounted" block** — asserts the exact ordered list of signatures, that static paths (`/search`, `/categories`) precede `/:id`, and that `getAuth` is a router-level middleware.
- **"authorization" block** — parameterised over the six write signatures (must contain `isAuth` before `isAdmin`) and four read signatures (must contain neither).
- **"caching" block** — verifies `GET /` and `POST /search` share an identical `setCache` entry with `keyAs: "products:search"`, that `GET /categories` and `GET /:id` carry the catalogue tag, and that every write calls `invalidateCache([products])`.
- **"uploads and flags" block** — checks that image-accepting routes chain `upload.single(imageUpload)` → `validateUploadedImages` → `quarantineUploadedImages`, and that `routeFlag(hardDelete)` appears only on `DELETE /:id/hard`.

## Relationships

- **`src/modules/products/routes.ts`** — the file under test; the import of `router` is the sole production-code dependency. Every assertion inspects its mounted middleware table.
- **`tests/support/routes.ts`** — supplies the test-harness utilities (`routeTable`, `routerMiddleware`, `routeSignatures`, `optionsOf`) and the mock factories (`cacheMock`, `routeFlagMock`, `storageMock`) referenced by the three `jest.mock` calls. The mocks replace real infrastructure so the test can inspect chain strings without a running server or storage backend.

## Notes

- The file deliberately asserts the cache-invalidation tag as a **literal string** (`'invalidateCache([products])'`) rather than via the `TAG` constant, so a rename on the writer side fails the test instead of silently matching.
- `jest.mock` calls use `jest.requireActual('@tests/routes')` to obtain the mock factories — this means `tests/support/routes.ts` must be importable in the test environment without circular dependency issues.
- The "mounts exactly" test asserts the full array with `toEqual`; adding or removing any route breaks it, which is the intended guard against unreviewed additions.
- Express route matching is order-sensitive; the shadowing test (`indexOf('/search') < indexOf('/:id')`) is the only thing protecting static segments from being swallowed by the parameterised route.
