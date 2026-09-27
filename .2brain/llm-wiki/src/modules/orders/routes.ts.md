---
source: src/modules/orders/routes.ts
sha256: c942a49e65412e08ad3aa8963e5d18e30ee8e46d795a2dc2c1f228f9dbc9291c
generated_at: 2026-09-27T15:12:37.008720+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/routes.ts

## Purpose

Express router that wires up every order endpoint, enforcing session-based authentication on all routes and splitting access between customer-scoped reads/writes and admin-gated mutations. It exists as the single place where route ordering, middleware chains, and permission guards are declared for the orders domain.

## Key elements

- **`router`** (exported `Router`) — the sole export; mounted by the orders module.
- **Global guard** (`router.use(getAuth, isAuth)`) — every route requires a valid session; API-key credentials are deliberately excluded.
- **`POST /search`** — caller-scoped search; `noStore` prevents any shared caching.
- **`GET /`** — list orders; `privateNoCache` allows browser-side revalidation.
- **`POST /`** — admin order creation; `idempotencyKey` before the handler so retries replay the same order; `invalidateCache(['products'])`.
- **`DELETE /`** — bulk admin delete (IDs in body).
- **`POST /:id/cancel`** — the single write a customer may perform; `invalidateCache(['products'])`.
- **`POST /:id/status-override`** — admin; must precede `/:id` to avoid being swallowed.
- **`GET /:id/invoice`** — on-demand PDF render; `invoiceLimiter` (from `rate-limits.ts`) throttles Chromium launches.
- **`GET /:id`** — caller's own order; `privateNoCache`.
- **`PUT /:id`** / **`PATCH /:id`** — admin replace / merge; `requirePermission('orders.any.update')`.
- **`DELETE /:id`** — admin soft-delete (or hard if `?hardDelete=true`).
- **`POST /:id/restore`** — undo a soft delete.
- **`DELETE /:id/hard`** — same delete with the flag spelled in the path via `routeFlag('hardDelete')`.

## Relationships

- **`@kernel/middlewares/authorizations`** — provides `getAuth`, `isAuth`, `requirePermission`; applied globally and per-route.
- **`@infrastructure/http/middlewares/cache`** — `noStore`, `privateNoCache`, `invalidateCache` shape every cache-control and tag-invalidation decision.
- **`@infrastructure/http/middlewares/idempotency`** — `idempotencyKey` guards the create route against duplicate POSTs.
- **`@infrastructure/http/middlewares/route-flag`** — `routeFlag('hardDelete')` translates the `/hard` path segment into a query parameter for `deleteOrders`.
- **`./rate-limits`** — exports `invoiceLimiter`, applied to the invoice route to cap concurrent Chromium spawns.
- **Controllers (`get-orders`, `create-order`, `update-order`, `delete-orders`, `restore-orders`, `get-order-item`, `get-order-invoice`, `post-cancel-order`, `post-order-status-override`)** — each is the terminal handler for its route; this file only sequences middleware and delegates.
- **`./module.ts`** — mounts this router into the orders feature module (and presumably registers it on the app's `/orders` prefix).

## Notes

- **Route ordering is load-bearing.** Static segments (`/search`) and longer paths (`/:id/invoice`, `/:id/hard`, `/:id/cancel`, `/:id/status-override`, `/:id/restore`) must appear before the bare `/:id` handler or they will never match.
- **Session-only auth is intentional.** The comment block explains that `isAuthOrCredential` would let an API-key call resolve to no `authContext`, silently widening `callerScope` from "my orders" to a fallback. Opening this router to credentials requires splitting it first.
- **No route tags the cache with `orders`.** The `invalidateCache` calls on create and cancel target the `products` tag because order writes affect product availability, not an `orders` cache tag that doesn't yet exist here.
- **`DELETE /:id` vs `DELETE /:id/hard` are the same handler.** The only difference is that `routeFlag('hardDelete')` injects the flag, so the controller logic is shared.
- **`POST /:id/restore` is idempotent-by-nature** (a second DELETE after a restore re-soft-deletes), but there is no explicit idempotency-key middleware on it.
