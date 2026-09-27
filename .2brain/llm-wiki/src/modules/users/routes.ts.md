---
source: src/modules/users/routes.ts
sha256: cbc5ccfef2b12f29918e3239d45e0d37ecbb24e10e7b0a05e2002f398820003f
generated_at: 2026-09-27T15:38:50.387266+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/routes.ts

## Purpose

Defines the Express `Router` for the admin-only `/users` API surface (search, list, read, create, update, delete, restore, 2FA removal). It wires each endpoint to the appropriate authorization key, caching policy, rate-limit, upload, and route-flag middleware, then delegates to the per-action controllers.

## Key elements

- **`router`** (exported `Express.Router`) — the single public export; mounted by `src/modules/users/module.ts`.
- **Router-level middleware** — `getAuth` → `isAuthOrCredential`: every route requires authentication; API keys (`sk_…`) are explicitly allowed alongside session tokens.
- **`requirePermission('users.any.*')`** — applied per-route with the specific action key (`read`, `create`, `update`, `delete`); there is no single router-wide gate.
- **Route table** — `POST /search`, `GET /`, `POST /`, `DELETE /`, `GET /:id`, `PUT /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/restore`, `DELETE /:id/hard`, `DELETE /:id/2fa`.
- **Cache middlewares** — `noStore` on `POST /search`; `privateNoCache` on the two `GET` read routes; all write/DELETE routes are uncached by omission.
- **Upload + rate-limit** — `uploadLimiter` and `upload.image()` guard the three mutation endpoints that accept an avatar (`POST /`, `PUT /:id`, `PATCH /:id`).
- **`routeFlag('hardDelete')`** — on `DELETE /:id/hard`, injects the flag so the shared `deleteUsers` controller performs a hard (permanent) delete.

## Relationships

- **`src/modules/users/module.ts`** — imports `router` and mounts it under the users path prefix.
- **Controllers** (`get-users`, `create-user`, `update-user`, `delete-users`, `restore-users`, `get-user-item`, `delete-user-two-factor`) — terminal handlers for each route; `deleteUsers` is reused by both `DELETE /:id` and `DELETE /:id/hard` (differentiated only by `routeFlag`).
- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuthOrCredential`, `requirePermission`.
- **`src/infrastructure/http/middlewares/cache.ts`** — provides `noStore`, `privateNoCache`.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — provides `uploadLimiter`.
- **`src/infrastructure/http/middlewares/upload.ts`** — provides `upload.image()`.
- **`src/infrastructure/http/middlewares/route-flag.ts`** — provides `routeFlag`.
- **`src/modules/users/tests/unit/routes.test.ts`** — unit-tests route registration, middleware ordering, and permission keys.
- **`tests/support/routed-modules.ts`** — mounts this router in integration test harnesses.

## Notes

- **Route order matters:** `POST /search` is registered *before* `GET /:id`; reordering would cause "search" to be captured as `:id`.
- **Caching policy is deliberate, not incidental:** admin-only responses are excluded from shared (Redis) cache per RFC 9111 §3.5; `privateNoCache` still lets the browser revalidate on each request.
- **`isAuthOrCredential` vs `isAuth`:** the choice is intentional — partner integrations authenticating with API keys must reach this module. No controller reads `authContext` directly.
- **`DELETE /:id/hard` is syntactic sugar:** it calls the same `deleteUsers` controller as `DELETE /:id`; the only difference is the `routeFlag('hardDelete')` middleware injecting the flag.
- **2FA deletion uses `users.any.update`**, not `users.any.delete`, matching the authorization-key catalogue description ("clearing a second factor").
