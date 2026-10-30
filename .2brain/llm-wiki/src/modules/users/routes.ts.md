---
source: src/modules/users/routes.ts
sha256: 998354f783d13de2ada9b4e792a465a88b3a61626cfdaaf7cd63ec894b42b0d4
generated_at: 2026-10-29T06:14:54.692523+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/routes.ts

## Purpose

Defines the admin-only Express router for `/users` CRUD, activation, purchase-hold, and hard-delete operations. Wires each endpoint to its controller with the appropriate authentication, permission, caching, rate-limit, and fresh-auth middleware so that sensitive writes (role changes, account activation) demand re-authentication while reads stay cacheable per RFC 9111.

## Key elements

- **`router`** (export) — The sole export; an Express `Router` mounted by the users module. All routes require `getAuth` + `isAuthOrCredential` at the router level.
- **`changesPowers(request)`** (local) — Async predicate for `requireFreshAuthWhen`. Returns `true` when the caller holds `assign:Role` **and** the payload would change role or create a deactivated account. Compares against the stored role via `roleChangeRequested`; a failed read conservatively returns `true`.
- **`switchesAccount(request)`** (local) — Async predicate for activate/deactivate routes. Returns `true` when the caller holds `assign:Role`, ensuring role-managers must re-authenticate before toggling an account's active state.
- **Route table** — 14 endpoints covering search, list, create, read, replace, patch, soft-delete, hard-delete, restore, purchase-hold (put/delete), activate, deactivate. Each mounts its own `requirePermission` key, relevant cache header, and (for writes) `uploadLimiter` + `upload.image()`.

## Relationships

- **`@kernel/ability`** (`holds`) — Used by both local predicates to test whether the caller's ability set includes `assign:Role`.
- **`@kernel/middlewares/authorizations`** — Supplies `getAuth`, `isAuthOrCredential`, `requirePermission`, and `requireFreshAuthWhen` used on every route.
- **`@infrastructure/http/middlewares/cache`** (`noStore`, `privateNoCache`) — Applied to read/search endpoints to prevent shared-cache leakage of admin-only data.
- **`@infrastructure/http/middlewares/rate-limit`** (`uploadLimiter`) — Rate-limits multipart upload routes (create, PUT, PATCH).
- **`@infrastructure/http/middlewares/upload`** (`upload.image()`) — Populates `request.body` with image data before controllers run.
- **`@infrastructure/http/middlewares/route-flag`** (`routeFlag`) — Sets `?hardDelete=true` on the `/users/:id/hard` route so the shared `deleteUsers` controller branches correctly.
- **`./services/update`** (`roleChangeRequested`) — Queried by `changesPowers` to compare incoming role against the stored one.
- **Controllers** (`get-users`, `create-user`, `update-user`, `delete-users`, `restore-users`, `get-user-item`, `purchase-hold`, `activation`) — Terminal handlers each route delegates to after middleware.
- **`src/modules/users/module.ts`** — Registers this `router` under the `/users` prefix (referenced in the module JSDoc).

## Notes

- **Route ordering matters:** `POST /search` is declared before any `/:id` route so Express does not match the literal string `"search"` as an `id`.
- **Per-route permissions, not a router-wide gate:** Each endpoint states its own `requirePermission` key (`read`, `create`, `update`, `delete`, `ban`) because different roles map to different keys; a single router-level gate would block valid actors.
- **`isAuthOrCredential`, not `isAuth`:** API keys (`sk_…`) are explicitly permitted on every route; no controller reads `authContext`, so the distinction is invisible downstream.
- **`changesPowers` must run after `upload.image()`:** multipart bodies arrive as strings (`'false'`) until the upload middleware parses them; the predicate checks both boolean and string forms.
- **Hard delete is reachable two ways:** `DELETE /users/:id?hardDelete=true` (query param read by the controller) **or** `DELETE /users/:id/hard` (path form, where `routeFlag` injects the query param). Both funnel into the same `deleteUsers` controller.
