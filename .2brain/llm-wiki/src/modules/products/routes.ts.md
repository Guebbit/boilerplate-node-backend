---
source: src/modules/products/routes.ts
sha256: 50d226a2bcb5b8436a606e4237175c1a74a78060ae5ce36f9787abb4b7a00930
generated_at: 2026-10-29T05:28:20.888895+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/routes.ts

## Purpose

Defines the Express router for all product catalogue endpoints. Public reads (search, single product, facets) are cacheable and anonymous-friendly; admin writes (create, update, delete, restore) require specific permission keys and invalidate the cache on mutation. The file also encodes the cache-scope policy that prevents a privileged caller's broader response from being stored under an anonymous cache key.

## Key elements

- **`router`** (exported) — The Express `Router` instance registered by the module. All product catalogue routes hang off it.
- **`cacheScopeKey`** — Predicate that returns `true` only when the caller sees exactly what a guest sees (no stock counters, no extra translations). Used as the `scopeKey` argument to `setCache`/`searchCache` so that privileged callers bypass Redis entirely.
- **`cacheProductsSearch`** — Pre-built `searchCache` middleware for the two search entry points, keyed on the query parameters that change the result set.
- **Route definitions** (in declaration order):
  - `POST /search`, `GET /` — public catalogue search (shared `cacheProductsSearch`).
  - `POST /` — create product (requires `create:Product` + `update:Translation`).
  - `DELETE /` — bulk delete by body IDs.
  - `GET /facets` — filter chips; cached with a trivial `() => true` scope (always the same answer).
  - `GET /:id` — single product; cached with `browserRevalidate: true`.
  - `PUT /:id` / `PATCH /:id` — replace / merge; both require `update:Product` + `update:Translation`.
  - `DELETE /:id` — soft delete (or hard if `?hardDelete=true`).
  - `POST /:id/restore` — undo a soft delete.
  - `DELETE /:id/hard` — hard delete; uses `routeFlag('hardDelete')` middleware.

## Relationships

- **`authorizations.ts`** — `getAuth` is applied globally on the router; individual write routes add `isAuthOrCredential` + `requirePermission(...)` guards.
- **`locale-preview.ts`** — `previewDraftLanguage` runs as the first middleware on each catalogue read, before the cache middleware, because the cache key derives from `request.locale`.
- **`cache.ts`** — `searchCache` (shared search), `setCache` (facets, single product), and `invalidateCache(['products'])` (every mutating route) come from here.
- **`rate-limit.ts`** — `uploadLimiter` gates the three image-upload routes (create, PUT, PATCH).
- **`upload.ts`** — `upload.image()` parses multipart image bodies on those same three routes.
- **`route-flag.ts`** — `routeFlag('hardDelete')` normalises the hard-delete intent for `DELETE /:id/hard`.
- **`query.ts`** — `hasAnonymousReadScope` is called inside `cacheScopeKey` to determine whether the caller's scope is equivalent to a guest's.
- **Controllers** — Each route delegates to exactly one controller export (`getProducts`, `createProduct`, `replaceProduct`, `updateProduct`, `deleteProducts`, `restoreProducts`, `getProductItem`, `getCatalogueFacets`).
- **`module.ts`** — Registers this `router` into the application's route table.

## Notes

- **Route order is load-bearing.** Static segments (`/search`, `/facets`) are declared before `/:id` so Express does not match them as an `id` parameter. Adding a new static segment below `/:id` will silently 404.
- **Two-key write guard.** Create, PUT, and PATCH all require *both* `Product` and `Translation` permissions simultaneously. This is intentional: a key holding only one cannot complete the write, which separates rewording from repricing.
- **`getAuth` ≠ identity check.** The router applies `getAuth` to every route (including public reads) so downstream code always has a caller context, but anonymous requests are allowed through. Only write routes add a stricter guard.
- **`browserRevalidate` on `GET /:id`.** The server still serves from Redis, but the browser must send `If-None-Match` first (304 path) because the `available` field can change via a stock write that no server-side `invalidateCache` can reach inside a client's cache.
- **Facets scope is `() => true`.** Unlike search and `/:id`, the facets endpoint returns the same data regardless of caller (active rows only, unconditionally), so every caller safely shares one cache entry.
- **`DELETE /:id` vs `POST /:id/restore` vs `DELETE /:id/hard`.** Soft delete, restore, and hard delete are three distinct routes. A second `DELETE /:id` does *not* hard-delete; the caller must use the restore or hard endpoint explicitly.
