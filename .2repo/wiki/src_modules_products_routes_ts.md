# src/modules/products/routes.ts

## Purpose

Defines the Express router for all product-catalogue HTTP endpoints. It declares route paths, attaches the correct middleware chain (auth, caching, file-upload, route-flag), and delegates to the product controllers. Public read operations and admin-gated write operations share this single router.

## Key elements

- **`router`** (exported) — the `express.Router()` instance consumed by `module.ts`.
- **Route table** — 10 endpoints spanning `POST /search`, `GET /`, `POST /`, `PUT /`, `DELETE /`, `GET /categories`, `GET /:id`, `PUT /:id`, `DELETE /:id`, `DELETE /:id/hard`.
- **Auth middleware chain** — `getAuth` applied globally; `isAuth` + `isAdmin` added per-route on all write operations.
- **Caching** — `setCache(3600, …)` on read routes (tag `products`); `invalidateCache(['products'])` on every write route.
- **`upload.single('imageUpload')`** — Multer-style single-file upload prepended to create/update routes.
- **`routeFlag('hardDelete')`** — converts a path segment into a boolean flag on `DELETE /:id/hard`.
- **`searchProductsKeyParameters`** — imported from `get-products` controller; used as the dynamic portion of the search cache key.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuth`, `isAdmin`; applied before every controller call.
- **`src/infrastructure/http/middlewares/cache.ts`** — provides `setCache` / `invalidateCache`; controls response caching under the `products` tag.
- **`src/infrastructure/http/middlewares/route-flag.ts`** — provides `routeFlag`; used on the hard-delete route to derive a flag from the path.
- **`src/infrastructure/adapters/storage.ts`** — provides `upload`; handles multipart image upload on write routes.
- **`src/modules/products/controllers/get-products.ts`** — provides `getProducts` handler and `searchProductsKeyParameters`.
- **`src/modules/products/controllers/write-products.ts`** — provides `writeProducts` (create + update).
- **`src/modules/products/controllers/delete-products.ts`** — provides `deleteProducts` (soft or hard depending on flag).
- **`src/modules/products/controllers/get-product-item.ts`** — provides `getProductItem` for the `/:id` GET.
- **`src/modules/products/controllers/get-catalogue-facets.ts`** — provides `getCatalogueFacets` for `/categories`.
- **`src/modules/products/module.ts`** — imports `router` from this file to mount it into the application.
- **`docs/theory/reading-path.md`** — references this file as part of the module's reading path.

## Notes

- **Route ordering matters.** `/search` and `/categories` are static segments declared *before* `/:id`; swapping them would cause "search" or "categories" to be captured as `:id`.
- **Duplicate write paths.** Both `PUT /` (id in body) and `PUT /:id` (id in path) call `writeProducts`; they exist to support different client conventions.
- **Shared cache key.** `POST /search` and `GET /` intentionally share the `products:search` cache key, so a search via either verb populates the same entry.
- **`DELETE /:id` vs `DELETE /:id/hard`.** Same controller, same middleware except the latter adds `routeFlag('hardDelete')` instead of relying on a `?hardDelete=true` query parameter.
