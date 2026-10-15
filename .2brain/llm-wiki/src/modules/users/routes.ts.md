---
source: src/modules/users/routes.ts
sha256: d065556ca20b157db97fe52b50a447b9854977785398a854a86d84d97892b3c4
generated_at: 2026-10-15T12:09:44.284782+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/routes.ts

## Purpose

Defines the Express `Router` for the admin-only `/users` resource: search, list, create, read-by-id, replace, patch, soft/hard delete, and restore. It wires each route to the correct authorization, caching, rate-limit, and upload middleware, then delegates business logic to the `controllers/` functions.

## Key elements

- **`router`** (exported) – the sole export; an Express `Router` instance with all user endpoints mounted.
- **Router-level middleware** – `getAuth` + `isAuthOrCredential` applied to every route (accepts both session tokens and `sk_…` API keys).
- **`POST /search`** – `users.any.read`; deliberately placed before `/:id` so the literal path isn't swallowed by the param route.
- **`GET /`** – `users.any.read`; `privateNoCache` (browser may cache but must revalidate).
- **`POST /`** – `users.any.create`; `uploadLimiter` + `upload.image()` before `createUser`.
- **`DELETE /`** – `users.any.delete`; bulk delete, id in body.
- **`GET /:id`** – `users.any.read`; `privateNoCache`.
- **`PUT /:id`** – `users.any.update`; full replace via `replaceUser`; image upload pipeline.
- **`PATCH /:id`** – `users.any.update`; partial merge via `updateUser`; image upload pipeline.
- **`DELETE /:id`** – `users.any.delete`; soft delete (or hard if `?hardDelete=true`).
- **`POST /:id/restore`** – `users.any.delete`; undoes a soft delete.
- **`DELETE /:id/hard`** – `users.any.delete`; hard delete path, gated by `routeFlag('hardDelete')`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/middlewares/authorizations.ts` | Provides `getAuth`, `isAuthOrCredential`, `requirePermission` – every route composes one permission key. |
| `src/infrastructure/http/middlewares/cache.ts` | Provides `noStore` (all POST responses) and `privateNoCache` (GET list / item) to prevent cross-tenant leakage in shared caches. |
| `src/infrastructure/http/middlewares/rate-limit.ts` | Provides `uploadLimiter`, applied to the three image-upload routes. |
| `src/infrastructure/http/middlewares/upload.ts` | Provides `upload.image()`, mounted before the create/replace/patch controllers. |
| `src/infrastructure/http/middlewares/route-flag.ts` | Provides `routeFlag('hardDelete')`, injected on `DELETE /:id/hard` so the controller can distinguish the path-based hard-delete from the query-param variant. |
| `src/modules/users/controllers/*` (6 files) | Each controller function is the terminal handler for its route; the router contributes no business logic. |
| `src/modules/users/module.ts` | Consumes `router` to mount the `/users` prefix in the application. |
| `src/modules/users/tests/unit/routes.test.ts` | Unit-tests route registration, middleware ordering, and permission keys. |

## Notes

- **Route order is load-bearing.** `POST /search` must stay above any `/:id` route; adding a new literal sub-path above `/:id` is required, below it is a 404.
- **Per-route permission keys** (not a single router-wide `requirePermission`) are intentional: `manager`-level reads and `support`-level reads share the same `users.any.read` key, but the file's comment notes a previous bug where a single router-level gate on one key blocked the other role. Keep one key per mount.
- **`isAuthOrCredential` vs `isAuth`** – this module is the one user-facing surface reachable by `sk_…` API keys (partner account-sync). Switching to `isAuth` would silently break integrations.
- **Caching discipline** – no GET here is Redis-cached. `noStore` on POSTs and `privateNoCache` on GETs enforce RFC 9111 §3.5 (must not store admin-only data in a shared store). Don't add `maxAge` without a storage-isolation review.
- **Two hard-delete paths** – `?hardDelete=true` on `DELETE /:id` and the explicit `DELETE /:id/hard` are functionally identical; the latter exists so the flag is visible in the path for audit logging. Both funnel into the same `deleteUsers` controller.
