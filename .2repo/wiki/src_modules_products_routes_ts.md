# src/modules/products/routes.ts

## Purpose

Defines the Express router for the product catalogue. It wires public read endpoints (list, search, single item, facets) and admin-only write endpoints (create, update, delete) into a single router, applying authentication, rate-limiting, cache, and file-upload middleware in the correct per-route order.

## Key elements

- **`router`** (exported) – The Express `Router` instance, the single public export of this file.
- **`cacheProductsSearch`** (module-local) – A shared `searchCache('products', searchProductsKeyParameters)` instance applied to both the `POST /search` and `GET /` read routes so the response is cached on the parameters that actually change the result set.
- **`POST /search` / `GET /`** – Public product list/search; both use `cacheProductsSearch` → `getProducts`.
- **`GET /categories`** – Public filter-facet list; cached 1 h via `setCache(3600, …)` → `getCatalogueFacets`.
- **`GET /:id`** – Public single-product read; cached 1 h → `getProductItem`.
- **`POST /`, `PUT /`, `PUT /:id`** – Admin create/update; pipeline is `uploadLimiter` → `isAuth` → `isAdmin` → `invalidateCache(['products'])` → `upload.single('imageUpload')` → `writeProducts`.
- **`DELETE /`, `DELETE /:id`** – Admin soft-delete; `isAuth` → `isAdmin` → `invalidateCache` → `deleteProducts`.
- **`DELETE /:id/hard`** – Same delete, but the `routeFlag('hardDelete')` middleware injects the hard-delete flag into the request (path-based alternative to `?hardDelete=true`).

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** – Provides `getAuth` (applied globally via `router.use`), `isAuth`, and `isAdmin` guards.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** – Provides `uploadLimiter`, throttling write routes that accept uploads.
- **`src/infrastructure/adapters/storage.ts`** – Provides `upload` (multer instance) used for the `imageUpload` field on create/update routes.
- **`src/infrastructure/http/middlewares/cache.ts`** – Provides `searchCache`, `setCache`, and `invalidateCache` for read caching and write-side cache busting.
- **`src/infrastructure/http/middlewares/route-flag.ts`** – Provides `routeFlag('hardDelete')` to translate the `/hard` path segment into a request flag.
- **`src/modules/products/controllers/get-products.ts`** – Supplies `getProducts` handler and `searchProductsKeyParameters` (the parameter list used as the cache key).
- **`src/modules/products/controllers/write-products.ts`** – Supplies the `writeProducts` handler for create/update.
- **`src/modules/products/controllers/delete-products.ts`** – Supplies the `deleteProducts` handler.
- **`src/modules/products/controllers/get-product-item.ts`** – Supplies the `getProductItem` handler.
- **`src/modules/products/controllers/get-catalogue-facets.ts`** – Supplies the `getCatalogueFacets` handler.
- **`src/modules/products/module.ts`** – Mounts this router into the application.
- **`src/modules/products/tests/unit/routes.test.ts`** – Unit tests exercising route wiring and middleware order.
- **`tests/cross-cutting/authenticated-controllers.test.ts`** – Verifies auth middleware is present on protected routes.
- **`tests/cross-cutting/write-routes-are-guarded.test.ts`** – Asserts every write route carries the `isAuth`/`isAdmin` chain.

## Notes

- **Route order is significant.** `/search` and `/categories` are declared before `/:id` so Express does not match them as a parameter. Adding a new static segment must follow the same rule.
- **`getAuth` is applied to every route** (including public reads) via `router.use`, so downstream handlers can inspect `req` for an authenticated caller without requiring one.
- **Cache invalidation is tag-based.** All write/delete routes call `invalidateCache(['products'])`; read routes are tagged `'products'`. Adding a new product-reading endpoint requires tagging it the same way for correct busting.
- **Hard delete has two entry points:** the query param `?hardDelete=true` on `DELETE /:id` and the explicit `DELETE /:id/hard` path. Both funnel into `deleteProducts`; the path variant uses `routeFlag` to set the flag server-side.
