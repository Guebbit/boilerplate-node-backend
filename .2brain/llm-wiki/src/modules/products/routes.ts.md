---
source: src/modules/products/routes.ts
sha256: f219a300af7e2edb89be641ece200f37f2c827fa3c688aae3409921da3aeac03
generated_at: 2026-09-27T15:33:30.466568+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/routes.ts

## Purpose
Express router that wires every HTTP endpoint for the product catalogue: public storefront reads (search, list, single item, category facets) and admin/supplier writes (create, replace, update, delete, restore, hard-delete). It centralizes the cross-cutting concerns—authentication, permission checks, caching, rate-limiting, and image uploads—so controllers stay focused on business logic.

## Key elements
- **`router`** (exported `Router`) — the single Express router consumed by the product module. All endpoints live here.
- **`cacheScopeKey`** (local fn) — returns `true` when the caller's auth context is anonymous-scope, meaning the response can safely share the guest's Redis entry; `false` for admins, who bypass the cache entirely.
- **`cacheProductsSearch`** (local const) — `searchCache` instance keyed on `searchProductsKeyParameters`, applied to both the `POST /search` and `GET /` listing routes.
- **Route table** — 12 endpoints covering:
  - `POST /search` + `GET /` — public product search/list (cached)
  - `POST /` — create product (upload, dual-permission, cache-invalidate)
  - `DELETE /` — bulk soft-delete by body ids
  - `GET /categories` — filter facets (always shared cache, 1 h TTL)
  - `GET /:id` — single product (cached, scope-aware)
  - `PUT /:id` / `PATCH /:id` — full replace vs. partial merge (upload, dual-permission)
  - `GET /:id/admin` — all-translation admin view (never cached)
  - `DELETE /:id` — soft-delete single item
  - `POST /:id/restore` — undo a soft delete
  - `DELETE /:id/hard` — hard-delete (uses `routeFlag('hardDelete')`)

## Relationships
- **`@kernel/middlewares/authorizations`** — `getAuth` applied globally via `router.use`; `isAuthOrCredential` + `requirePermission` guard every write and admin-read route.
- **`@infrastructure/http/middlewares/cache`** — `searchCache`, `setCache` provide read-through Redis caching; `invalidateCache(['products'])` is chained into every write/mutation route.
- **`@infrastructure/http/middlewares/rate-limit`** — `uploadLimiter` throttles the three upload-bearing write routes.
- **`@infrastructure/http/middlewares/upload`** — `upload.image()` parses the multipart image field on create/replace/update.
- **`@infrastructure/http/middlewares/route-flag`** — `routeFlag('hardDelete')` injects the `hardDelete` flag on the `/:id/hard` path, equivalent to the `?hardDelete=true` query param.
- **`@kernel/access/query`** — `hasAnonymousReadScope` is the single check inside `cacheScopeKey` that decides whether the caller may share the guest's cached response.
- **Controllers (`get-products`, `create-product`, `update-product`, `delete-products`, `restore-products`, `get-product-item`, `get-product-admin`, `get-catalogue-facets`)** — each terminal handler in a route chain; this file only declares *who* may call and *how* the response is cached, not *what* the service does.
- **`./service`** — exports `callerScope` (the scope descriptor passed to `hasAnonymousReadScope`).
- **`src/modules/products/module.ts`** — registers `router` into the application's route tree.

## Notes
- **Route order is load-bearing.** Static segments (`/search`, `/categories`, `/restore`, `/hard`) are declared before `/:id` so they aren't swallowed as an id.
- **Dual permission on create/replace/update.** Both `products.any.{create|update}` *and* `translations.any.update` are required; neither alone is sufficient. This prevents a rewording credential from repricing, and vice-versa.
- **`isAuthOrCredential` (not `isAuth`) on writes.** PIM feeds and supplier integrations may hold the required keys without a user session (see `docs/tools/security.md#machine-to-machine-credentials`).
- **`/categories` uses `scopeKey: () => true`.** Unlike search/`:id`, the facets endpoint always returns only active rows regardless of caller, so there is no admin-only variant to keep out of the shared cache.
- **`/:id/admin` is intentionally uncached.** It backs a live editing screen; the same rationale applies to `GET /locales/:locale/entries`.
- **Two hard-delete entry points.** `DELETE /:id?hardDelete=true` (query param) and `DELETE /:id/hard` (path). The path variant goes through `routeFlag` to set the flag in-request; functionally identical.
