---
source: src/modules/products/routes.ts
sha256: 3d369bcac728d783e0ab4556336b04e19c3af696c8b79c3d4b53ef877ec34999
generated_at: 2026-09-23T19:28:14.541398+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/routes.ts

## Purpose

Defines the Express `Router` for the product catalogue API. It wires public read endpoints (storefront) and admin write endpoints (create, update, delete) to their respective controllers, attaching authentication, permission, caching, rate-limiting, and file-upload middleware per route.

## Key elements

- **`router`** (exported `Router`) — the single export; mounted by the module. All product-catalogue HTTP methods are registered here.
- **`cacheProductsSearch`** (module-local) — a `searchCache('products', searchProductsKeyParameters)` instance shared by `POST /search` and `GET /`, so both search entry points hit the same cache key.
- **Route ordering** — `/search`, `/categories`, and `/:id/hard` are declared before `/:id` so their static segments are not swallowed by the parameterised pattern.

## Relationships

- **`@infrastructure/http/middlewares/cache.ts`** — supplies `searchCache`, `setCache`, and `invalidateCache`; every read route that can be cached uses the first two, and every write route calls `invalidateCache(['products'])`.
- **`@infrastructure/http/middlewares/rate-limit.ts`** — provides `uploadLimiter`, applied to the two upload-bearing routes (`POST /`, `PATCH /:id`).
- **`@infrastructure/http/middlewares/route-flag.ts`** — provides `routeFlag`, used on `DELETE /:id/hard` to inject the `hardDelete=true` flag without relying on a query string.
- **`@infrastructure/http/middlewares/upload.ts`** — provides `upload`, consumed via `upload.single('imageUpload')` on create and update.
- **`@kernel/middlewares/authorizations.ts`** — provides `getAuth` (global), `isAuthOrCredential` (write routes), and `requirePermission` (per-route permission gates).
- **`./controllers/*`** — each route's terminal handler is imported from the corresponding controller file (`getProducts`, `createProduct`, `updateProduct`, `deleteProducts`, `getProductItem`, `getProductAdmin`, `getCatalogueFacets`).
- **`src/modules/products/module.ts`** — mounts this `router` into the application's route tree.
- **`tests/support/routed-modules.ts`** — test harness that exercises the router in an integration context.
- **`src/modules/products/tests/unit/routes.test.ts`** — unit tests asserting route registration, order, and middleware chains.

## Notes

- `getAuth` is applied globally with no identity assertion: public reads must answer an anonymous browser. Write routes layer `isAuthOrCredential` on top, permitting machine-to-machine credentials (PIM feeds, supplier integrations).
- Create and update each require **two** permission keys (`products.any.create|update` **and** `translations.any.update`). Both are mandatory so that a translation-only edit cannot be mistaken for a product mutation and vice-versa.
- `GET /:id/admin` is deliberately **not** cached — it is the live edit screen, and caching would risk stale data mid-edit.
- `DELETE /products` (bulk, ids in body) and `DELETE /products/:id` (single) share the same controller; the hard-delete variant `DELETE /products/:id/hard` is equivalent to `DELETE /products/:id?hardDelete=true` but spells the flag in the path.
