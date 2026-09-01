# src/modules/products/routes.ts

## Purpose

Defines the Express router for the product catalogue. It wires public read endpoints and admin-gated write endpoints to their controllers, applies caching where the response is caller-independent, and ensures route ordering so static segments (`/search`, `/categories`) are not swallowed by the `/:id` parameter pattern.

## Key elements

- **`router`** (exported) — the `express.Router` instance consumed by the module mount.
- **Route table** — 10 route definitions covering GET/POST/PUT/DELETE on `/`, `/search`, `/categories`, `/:id`, and `/:id/hard`.
- **`cacheProductsSearch`** — a shared `searchCache('products', …)` middleware instance applied to both `GET /` and `POST /search`.
- **Middleware composition** — each route chains from `@kernel/middlewares/authorizations` (`getAuth`, `isAuth`, `isAdmin`), `@infrastructure/http/middlewares/cache` (`setCache`, `searchCache`, `invalidateCache`), `@infrastructure/adapters/storage` (`upload`), and `@infrastructure/http/middlewares/route-flag` (`routeFlag`).

## Relationships

- **`src/modules/products/module.ts`** — mounts `router` onto the application's product path.
- **Controllers** (`get-products`, `write-products`, `delete-products`, `get-product-item`, `get-catalogue-facets`) — each is the terminal handler for one or more routes defined here.
- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth`, `isAuth`, `isAdmin`; applied globally and per-route.
- **`src/infrastructure/http/middlewares/cache.ts`** — supplies the cache read/write/invalidate primitives used on every route.
- **`src/infrastructure/adapters/storage.ts`** — supplies the `upload` middleware for the `imageUpload` multipart field on write routes.
- **`src/infrastructure/http/middlewares/route-flag.ts`** — supplies `routeFlag('hardDelete')` for the `DELETE /:id/hard` variant.
- **`src/modules/products/tests/unit/routes.test.ts`** — unit-tests the route definitions and middleware order in this file.
- **`tests/cross-cutting/write-routes-are-guarded.test.ts`** — asserts that every write route in this file carries `isAuth` + `isAdmin`.
- **`tests/cross-cutting/authenticated-controllers.test.ts`** — exercises the controllers reachable from these routes under an authenticated context.

## Notes

- **Route order is load-bearing.** `/search` and `/categories` are declared before `/:id`; moving them after would cause the literal strings to be captured as an `id` parameter.
- **`getAuth` runs on every route** (including public reads) so that admin callers receive extended visibility without a separate admin endpoint.
- **Write routes invalidate the `'products'` cache tag** *before* the handler runs; the read routes set a 3600 s TTL on the same tag.
- **`DELETE /:id/hard`** is functionally equivalent to `DELETE /:id?hardDelete=true`; the path variant uses `routeFlag` to inject the flag so the controller sees the same shape.
- Upload field name is **`imageUpload`** (singular) — clients sending a different key will get a silent no-op on the image.
