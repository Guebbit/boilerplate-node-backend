---
source: src/modules/products/routes.ts
sha256: 2715404344220b181818b77b315d43038da6a62afbee764e2a178b2e3a5ee7be
generated_at: 2026-11-14T21:26:36.295958+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/routes.ts

## Purpose

Express router that maps every product-catalogue HTTP endpoint to its controller and surrounding middleware. It exists as the single place where route ordering (static segments before `/:id`), per-route authorization, cache tagging, idempotency, and upload handling are declared, so the controllers stay pure business logic.

## Key elements

- **`router`** — the exported `express.Router()`. All routes are attached to it; consumers mount it under `/products`.
- **`cacheScopeKey(request)`** — predicate that returns `true` only when the caller sees exactly what a guest sees (no extra stock or translation scope). Used to decide whether a request may share the anonymous Redis cache entry.
- **`cacheProductsSearch`** — pre-built `searchCache` middleware (from `@infrastructure/http/middlewares/cache`) parameterised with the query params that affect a search result. Shared by both `GET /` and `POST /search`.
- **Route definitions** (order matters):
  - `POST /search` — search with body params; declared before `/:id`.
  - `GET /` — paginated product list (public).
  - `POST /` — create product (admin); chains `uploadLimiter → isAuthOrCredential → requirePermission × 2 → invalidateCache → upload.image() → idempotencyKey → createProduct`.
  - `GET /facets` — filter chips; unconditionally cached for all callers.
  - `GET /:id` — single product (public); `browserRevalidate: true` forces a 304 check on stock changes.
  - `PUT /:id` / `PATCH /:id` — full-replace / merge update (admin); both require `update:Product` **and** `update:Translation`.
  - `DELETE /:id` — soft delete (admin).
  - `POST /:id/restore` — undo soft delete (admin).
  - `DELETE /:id/hard` — hard delete via path flag; `routeFlag('hardDelete')` sets the query param the controller reads.

## Relationships

- **`@kernel/middlewares/authorizations`** — `getAuth` applied globally; `isAuthOrCredential` + `requirePermission` on every write route.
- **`@kernel/middlewares/locale-preview`** — `previewDraftLanguage` runs before `setCache`/`searchCache` on all read routes so a draft-locale response is never stored under a live key.
- **`@infrastructure/http/middlewares/cache`** — `searchCache` and `setCache` gate reads; `invalidateCache(['products'])` runs before every mutating controller.
- **`@infrastructure/http/middlewares/rate-limit`** — `uploadLimiter` throttles all upload-bearing writes.
- **`@infrastructure/http/middlewares/idempotency`** — `idempotencyKey` fingerprints the (multer-parsed) body on `POST /` to prevent duplicate products on retry.
- **`@infrastructure/http/middlewares/route-flag`** — `routeFlag('hardDelete')` on the `DELETE /:id/hard` path injects the flag into the query.
- **`@kernel/access/query`** — `hasAnonymousReadScope` is the scope-half of `cacheScopeKey`.
- **`@domain-primitives/time`** — `HOUR_SECONDS` used as the Redis TTL for `setCache` on `/facets` and `/:id`.
- **Controllers** (`get-products`, `post-product`, `delete-products`, `post-product-restore`, `get-product`, `get-catalog-facets`) — terminal handlers each route dispatches to.

## Notes

- **Route order is intentional.** Static segments (`/search`, `/facets`) must precede `/:id`; reordering them will silently break those paths.
- **Two-key write rule.** Create, PUT, and PATCH all require *both* `Product` and `Translation` permissions. This is deliberate: a key that can only reword translations must not be able to reprice, and vice versa.
- **`idempotencyKey` sits *after* `upload.image()`.** Multipart fields don't exist until multer has parsed the stream, so the idempotency ledger must see the final body.
- **`cacheScopeKey` is a *bypass* gate, not a requirement.** A `true` return means "safe to share the guest entry"; `false` means "skip Redis entirely" so an admin's wider answer is never stored under the shared key.
- **`/facets` uses `() => true` instead of `cacheScopeKey`.** `productService.facets()` scopes to active rows unconditionally for every caller, so there is no wider answer to protect.
- **`browserRevalidate` on `GET /:id`.** The server still serves from Redis, but browsers must revalidate (304) because the page displays stock-availability that no server-side cache clear can reach.
