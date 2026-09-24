---
source: src/modules/users/controllers/get-users.ts
sha256: a2da0fb0a13e403460b7e8f01d75ebb2a456b85712c7c6cc948a0f8647c57314
generated_at: 2026-09-23T19:32:13.319157+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/get-users.ts

## Purpose

Implements the `GET /users` and `POST /users/search` admin endpoints. It is a thin controller that validates query/body parameters, delegates the actual search to `userService.search()`, and post-processes the returned rows by attaching each user's current role via a single batched lookup.

## Key elements

- **`searchUsersQuerySchema`** — Extends the orval-generated `SearchUsersBody` with `page`, `pageSize`, and `active` (all coerced from strings so GET query params work). Sourced from the shared `@infrastructure/http/schemas` primitives so every search endpoint agrees on legal values.
- **`searchUsersKeyParameters`** — Exported `string[]` derived via `Object.keys(schema.shape)`. Used as the set of parameters that must appear in the HTTP cache key; deriving it from the schema guarantees any parameter the controller reads is also part of the key.
- **`getUsers`** — The exported controller, built with `createSearchController({ entity: 'users', … })`. Its `runSearch` calls `userService.search(parsed)`, then fetches roles for the whole page in one call to `rolesOfMany(ids, DEPLOYMENT_TENANT_ID)` and maps each row through `userService.toUser(user, role)` before returning `{ items, meta }`.

## Relationships

- **`@infrastructure/http/schemas`** — Supplies `pageSchema`, `pageSizeSchema`, `optionalBooleanSchema` that compose `searchUsersQuerySchema`.
- **`@infrastructure/surfaces/create-search-controller`** — Factory that wraps the schema + `runSearch` into a routed, validated handler.
- **`@infrastructure/persistence/search`** — Provides the `PaginatedMeta` type that shapes the `meta` field of the response.
- **`@modules/users/service`** — Source of `userService.search()` and `userService.toUser()`.
- **`@modules/access`** (index) — Provides `rolesOfMany`, the batched role resolver.
- **`@kernel/access/tenant`** — Provides `DEPLOYMENT_TENANT_ID`, the tenant scope for the role lookup.
- **`@types`** — Source of the `User` interface used in the return type.
- **`src/modules/users/routes.ts`** — The routes file that registers `getUsers` on the router.

## Notes

- Rows coming back from `userService.search()` already carry `.id` (not `._id`) because `createRepository` applies a `normalize` step. The controller reads `.id` directly rather than re-deriving it.
- `rolesOfMany` is called **once** with the full page's IDs (a single `$in` query) rather than per-item, to avoid N+1 lookups. A missing role resolves to `null` via `roles.get(user.id) ?? null`.
- `page` / `pageSize` / `active` are intentionally absent-tolerant in the schema; `normalizePagination` (inside the search infrastructure) owns the defaults. The schema only constrains what _is_ present.
