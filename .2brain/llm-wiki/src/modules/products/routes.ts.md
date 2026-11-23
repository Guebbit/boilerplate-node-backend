---
source: src/modules/products/routes.ts
source_sha256: 88f162cce02741f82c946fea5555db9cba9e39e0c43cb83fc0bdf7f7b2387b84
context_sha256: f55e44d317bfc4164e1a98d90b66c4abbd053863d274c8b7f896bba434b7e809
generated_at: 2026-11-22T07:12:11.191674+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/routes.ts

## Purpose
Express router for the product catalogue: public reads (storefront, anonymous-friendly, cached in Redis where safe) and permission-gated admin writes. Route order is deliberate so static segments (`/search`, `/facets`) are not swallowed by `/:id`.

## Key elements
- `router` — the exported Express `Router`. `router.use(getAuth)` runs on every route with no identity guard; each write adds its own `isAuthOrCredential`, so a PIM or supplier feed credential may hold write rights.
- `cacheScopeKey(request)` — cache scope predicate. True only when the caller reads exactly what a guest reads (`hasAnonymousReadScope(productService.callerScope, …)` and `!canSeeTranslations`). Callers who see more bypass Redis.
- `cacheProductsSearch` — shared `searchCache('products', …)` middleware for both search entry points, using the key parameters and values exported from `get-products`. It uses `browserRevalidate: true`.
- Routes:
  - `POST /search` and `GET /` → `previewDraftLanguage`, `cacheProductsSearch`, `getProducts`.
  - `POST /` → create. Chain: `uploadLimiter`, `isAuthOrCredential`, `create:Product` and `update:Translation` permissions, `invalidateCache(['products'])`, the `upload` middleware's `image()` handler, `idempotencyKey`, `createProduct`.
  - `GET /facets` → `setCache(HOUR_SECONDS, …)` with `languageNeutral: true` and `scopeKey: () => true`, then `getCatalogFacets`.
  - `GET /:id` → `previewDraftLanguage`, `setCache(HOUR_SECONDS, …)` with `browserRevalidate`, then `getProductItem`.
  - `PUT /:id` → `replaceProduct`. `PATCH /:id` → `updateProduct`. Both need `update:Product` and `update:Translation`, and both use `uploadLimiter` and the `upload` middleware's `image()` handler.
  - `DELETE /:id` → `deleteProducts` (soft delete unless `?hardDelete=true`).
  - `POST /:id/restore` → `restoreProducts`.
  - `DELETE /:id/hard` → `routeFlag('hardDelete')`, then `deleteProducts`.

## Relationships
- **Controllers** (`controllers/get-products`, `get-product`, `get-catalog-facets`, `post-product`, `delete-products`, `post-product-restore`): the terminal handlers for each route. `get-products` also supplies the search cache key parameters, values and ordering.
- **`@kernel/middlewares/authorizations`**: supplies `getAuth`, `isAuthOrCredential` and `requirePermission`.
- **`@kernel/middlewares/locale-preview`**: `previewDraftLanguage` on the catalogue reads.
- **`@kernel/access/query`**: `hasAnonymousReadScope`, used by `cacheScopeKey`.
- **`@infrastructure/http/middlewares/cache`**: `searchCache`, `setCache` and `invalidateCache`.
- **`rate-limit`, `upload`, `idempotency`, `route-flag`** (same middlewares folder): `uploadLimiter`, the `upload` middleware, `idempotencyKey` and `routeFlag`.
- **`@domain-primitives/time`**: `HOUR_SECONDS`, the cache TTL.

## Notes
- `previewDraftLanguage` must run before `setCache`/`searchCache`. The cache key is built from `request.locale`, so otherwise a draft answer could be stored under a live key.
- Create and update require both `Product` and `Translation` permissions, so a translation-only edit cannot change the product itself.
- `idempotencyKey` comes after the upload middleware so it fingerprints the parsed multipart body. It is applied only to `POST /`, which matters because a product with no SKU has no other dedup key.
- `/facets` bypasses `cacheScopeKey` on purpose. The facets service always scopes to active rows, so all callers share one answer.
- `invalidateCache(['products'])` is registered on every write route, so any write clears the `products` cache tag.
- `browserRevalidate` makes browsers check with the server first (304 if unchanged). Staff edits clear Redis but cannot reach copies already in a browser.
- `PUT`/`PATCH` have no `idempotencyKey`.
