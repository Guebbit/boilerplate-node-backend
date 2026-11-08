---
source: src/modules/users/routes.ts
sha256: 960584f79d4e19f95cf30c527f32cdcd2ce8170cc6d4e63e48ebf0b7eeecb2b7
generated_at: 2026-11-08T08:48:04.413782+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/routes.ts

## Purpose

Defines the admin-only Express router for the `/users` namespace: search, CRUD, purchase-hold, activation/deactivation, and soft-delete restore. Wires each route to the correct permission gate, cache headers, upload handling, rate limiter, and the `requireFreshAuthWhen` guard for power-sensitive writes.

## Key elements

- **`router`** (exported) — the Express `Router` instance; all routes below are mounted on it.
- **`changesPowers(request)`** — predicate for `requireFreshAuthWhen`. Returns `true` when the caller holds `assign:Role` *and* the payload actually changes who holds powers (role set/cleared on update, or a role named / deactivated flag on create). On update it calls `roleChangeRequested` to compare against the stored role; a read failure defaults to asking.
- **`switchesAccount(request)`** — simpler predicate for activate/deactivate routes: asks for fresh auth only when the caller holds `assign:Role` (a role manager re-activating a deactivated admin or deactivating the last admin).

## Relationships

- **`@kernel/middlewares/authorizations`** — source of `getAuth`, `isAuthOrCredential`, `requirePermission`, and `requireFreshAuthWhen`; every route composes these in its middleware chain.
- **`@kernel/ability`** — `holds` is called inside both guards to test the caller's `assign:Role` ability.
- **`@infrastructure/http/middlewares/cache`** — `noStore` applied to every POST response; `privateNoCache` on GET list and GET item so admin data never enters a shared CDN/Redis cache.
- **`@infrastructure/http/middlewares/rate-limit`** — `uploadLimiter` throttles the create/update/replace routes that accept multipart image uploads.
- **`@infrastructure/http/middlewares/upload`** — `upload.image()` populates `request.body` before the controller runs; the guards read the body, so they are mounted *after* this middleware.
- **`@infrastructure/http/middlewares/route-flag`** — `routeFlag('hardDelete')` sets the flag consumed by `deleteUsers` on the explicit `DELETE /:id/hard` path.
- **Controllers** (`get-users`, `post-user`, `update-user`, `delete-users`, `post-user-restore`, `get-user`, `delete-purchase-hold`, `put-purchase-hold`, `post-user-activation`) — each route's terminal handler.
- **`./services/update`** — `roleChangeRequested` is the single cross-module dependency inside the guards, used to compare the incoming role against the stored one.

## Notes

- **No router-wide permission key.** The comment explains that a single `requirePermission` at `router.use` would block whichever of the `manager` / `support` keys the other route needs; each route therefore declares its own key explicitly.
- **Route ordering matters.** `POST /search` is registered before any `/:id` route so Express does not interpret `"search"` as an id parameter.
- **`isAuthOrCredential`, not `isAuth`.** This module is reachable with an `sk_…` API key (partner sync is the documented use case); no controller reads `authContext`.
- **Two hard-delete paths.** `DELETE /:id?hardDelete=true` and `DELETE /:id/hard` both call `deleteUsers`; the latter additionally runs `routeFlag('hardDelete')`. A second plain `DELETE` is a no-op (soft-delete is idempotent), so restore is a separate `POST /:id/restore`.
- **Purchase-hold and activate/deactivate ride the `ban` permission**, not `delete` or `update`, because they change a buyer's standing without touching login credentials.
- **`changesPowers` must stay after `upload.image()`.** For multipart creates the `active` flag arrives as the string `"false"`; the guard checks both `false` and `'false'` before validation coerces the type.
