---
source: src/modules/products/routes.ts
sha256: 886dedf182558c32d78b3c0bad43fb59c1e04352b381c6adb6825017505a26e4
generated_at: 2026-10-15T11:43:46.704419+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/routes.ts

## Purpose

Defines the Express Router for all product catalogue HTTP endpoints. Splits traffic into public storefront reads (no identity required) and admin/machine writes (permission-gated), applies per-route caching and upload handling, and enforces route ordering so static segments are not swallowed by the `/:id` wildcard.

## Key elements

- **`router`** (exported) — the single Express Router consumed by the application's top-level mount.
- **`cacheScopeKey(request)`** — returns `true` only when the caller's scope is indistinguishable from an anonymous guest *and* they cannot see stock counters. Used to gate Redis cache reads/writes so a wider-privileged caller never poisons or reads a shared cache entry.
- **`cacheProductsSearch`** — a `searchCache` middleware instance shared by `GET /` and `POST /search`; keyed on the query-parameter sets exported from `get-products` controller.
- **Route table** (in declaration order):

| Method & path | Guard / middleware | Handler |
|---|---|---|
| `POST /search` | cache → `getProducts` | `getProducts` |
| `GET /` | cache → `getProducts` | `getProducts` |
| `POST /` | rate-limit, auth, 2 permissions, cache-invalidate, upload | `createProduct` |
| `DELETE /` | auth, perm, cache-invalidate | `deleteProducts` |
| `GET /categories` | setCache (scopeKey always true) | `getCatalogueFacets` |
| `GET /settings` | — | `getProductSettings` |
| `GET /:id` | setCache (`browserRevalidate`) | `getProductItem` |
| `PUT /:id` | rate-limit, auth, 2 permissions, cache-invalidate, upload | `replaceProduct` |
| `PATCH /:id` | same as PUT | `updateProduct` |
| `GET /:id/admin` | auth, 2 permissions (no cache) | `getProductAdmin` |
| `DELETE /:id` | auth, perm, cache-invalidate | `deleteProducts` |
| `POST /:id/restore` | auth, perm, cache-invalidate | `restoreProducts` |
| `DELETE /:id/hard` | auth, perm, cache-invalidate, `routeFlag('hardDelete')` | `deleteProducts` |

## Relationships

- **`@kernel/middlewares/authorizations`** — imports `getAuth` (global middleware), `isAuthOrCredential` (write-route guard accepting service credentials), and `requirePermission` (per-route permission checks).
- **`@infrastructure/http/middlewares/rate-limit`** — `uploadLimiter` protects the three upload-bearing routes.
- **`@infrastructure/http/middlewares/upload`** — `upload.image()` parses multipart bodies on create/put/patch.
- **`@infrastructure/http/middlewares/cache`** — `searchCache`, `setCache`, and `invalidateCache` manage Redis reads/writes and tag-based invalidation.
- **`@infrastructure/http/middlewares/route-flag`** — `routeFlag('hardDelete')` injects a pseudo-query-param for the `DELETE /:id/hard` path.
- **`@kernel/access/query`** — `hasAnonymousReadScope` feeds into `cacheScopeKey` to decide cache eligibility.
- **`./services`** / **`./services/stock-view`** — `callerScope` and `canSeeStock` complete the cache-scope decision.
- **Controllers** (`get-products`, `create-product`, `update-product`, `delete-products`, `restore-products`, `get-product-item`, `get-product-admin`, `get-catalogue-facets`, `get-product-settings`) — terminal handlers for each route; this file imports only their default/named exports and composes them with middleware.

## Notes

- **Route order is load-bearing.** `/search`, `/categories`, and `/settings` are declared before `/:id`; reordering them will silently 404.
- **No identity guard on reads.** `getAuth` runs globally, but read routes intentionally serve anonymous browsers; the permission model is opt-in per write route.
- **Writes require *two* permission keys.** Create/put/patch each demand both a `products.any.*` key and `translations.any.update`. Neither alone suffices — a rewording must not become a repricing.
- **Cache bypass is by construction.** Any caller who sees inactive products or exact stock numbers (`cacheScopeKey` → `false`) skips Redis entirely rather than risk serving/storing a wider payload under a guest-keyed entry.
- **`GET /:id` uses `browserRevalidate: true`.** The `available` field changes on stock writes; a 304 round-trip is the only way to invalidate a stale browser copy since server-side cache invalidation cannot reach the client.
- **`GET /settings` is deliberately uncached** — a single env-var read is cheaper than the Redis lookup it would guard.
- **Two paths to hard-delete.** `DELETE /:id?hardDelete=true` and `DELETE /:id/hard` are equivalent; the latter uses `routeFlag` to set the flag without a query string.
- **`GET /:id/admin` is never cached** — it represents the active editing screen (same rationale as `GET /locales/:locale/entries`).
