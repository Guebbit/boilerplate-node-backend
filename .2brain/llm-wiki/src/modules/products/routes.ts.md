---
source: src/modules/products/routes.ts
sha256: 7bf1935751fcf865298c5f519a5d81e577c5151e4d1ab12833551a9dbe90a017
generated_at: 2026-11-08T07:46:45.011043+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/routes.ts

## Purpose

Express router that wires every product-catalogue HTTP endpoint (public reads, admin writes) to its controller, applying the correct middleware chain (auth, caching, rate-limiting, upload, permission guards) in the correct order. It is the single place where route paths, middleware composition, and cache-invalidation policy are decided for the product domain.

## Key elements

- **`router`** (exported) — the `Router()` instance; all product endpoints hang off it.
- **`cacheScopeKey`** — predicate that returns `true` only when the caller's read scope is *equivalent* to an anonymous guest (no extra stock or translation visibility). Used to decide whether a caller may share the guest's cached entry or must bypass Redis.
- **`cacheProductsSearch`** — pre-built `searchCache` middleware shared by `POST /search` and `GET /`, keyed on the search query parameters so different queries don't collide in Redis.
- **Route definitions** — seven endpoint groups:
  - `GET /` and `POST /search` — public product search (cached).
  - `GET /facets` — filter chips; cached for all callers unconditionally.
  - `GET /:id` — single product; cached with `browserRevalidate: true` (304 path) because the `available` flag can change server-side without a cache-bust reaching the browser.
  - `POST /` — create product (admin).
  - `PUT /:id` / `PATCH /:id` — replace / merge product (admin).
  - `DELETE /:id` — soft delete (admin).
  - `POST /:id/restore` — undo soft delete (admin).
  - `DELETE /:id/hard` — hard delete (admin); reuses the same `deleteProducts` handler with `routeFlag('hardDelete')` injected.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@kernel/middlewares/authorizations` | `getAuth` applied globally; `isAuthOrCredential` + `requirePermission` on every write route. |
| `@kernel/middlewares/locale-preview` | `previewDraftLanguage` leads each catalogue read so the locale is resolved *before* the cache key is built. |
| `@infrastructure/http/middlewares/cache` | `searchCache` / `setCache` on reads; `invalidateCache(['products'])` on every write and delete. |
| `@infrastructure/http/middlewares/rate-limit` | `uploadLimiter` throttles image-upload writes. |
| `@infrastructure/http/middlewares/upload` | `upload.image()` parses the image file before create/replace/patch. |
| `@infrastructure/http/middlewares/route-flag` | `routeFlag('hardDelete')` turns the `DELETE /:id/hard` path flag into a query-param the controller reads. |
| `@kernel/access/query` | `hasAnonymousReadScope` powers `cacheScopeKey`. |
| `@domain-primitives/time` | `HOUR_SECONDS` sets the TTL for facet and single-product cache entries. |
| `./controllers/*` (six files) | Each route delegates its final handler to the corresponding controller export. |
| `./services` / `./services/stock-view` / `./services/translation-view` | `productService.callerScope`, `canSeeStock`, `canSeeTranslations` feed the cache-scope predicate. |

## Notes

- **Route order is load-bearing.** `/search` and `/facets` are declared before `/:id`; otherwise Express would match the literal string `"search"` as an `id`.
- **Two-key permission gate on writes.** Create requires `create:Product` **and** `update:Translation`; replace/merge require `update:Product` **and** `update:Translation`. A single key is intentionally insufficient so a translation-only credential can't silently trigger a repricing (and vice-versa).
- **Facets bypasses `cacheScopeKey` on purpose.** `productService.facets()` unconditionally scopes to active rows, so every caller—admin or guest—receives the same payload; the scope key is hard-coded `() => true`.
- **`browserRevalidate` on `GET /:id`.** The server keeps serving from Redis, but the browser is forced to revalidate (304) because the `available` flag can flip via a stock write without any server-side cache invalidation reaching the client.
- **DELETE is soft by default.** A second `DELETE` does *not* hard-delete; the caller must use `POST /:id/restore` to undo or `DELETE /:id/hard` (which injects the flag via `routeFlag`) for an irreversible removal.
