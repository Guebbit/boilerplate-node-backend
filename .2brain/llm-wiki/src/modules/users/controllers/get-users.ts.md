---
source: src/modules/users/controllers/get-users.ts
sha256: 1fc5deb2c5f168d0d734a5942bda15020afd3d8f6698582d74c04db4efd5acd4
generated_at: 2026-09-27T15:36:39.265465+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/get-users.ts

## Purpose

Controller for `GET /users` (and `POST /users/search`) that lists or searches users via query parameters. It wraps the shared search-controller factory, validates the request with a Zod schema, delegates to `userService.search`, and enriches each returned user with their current role before responding.

## Key elements

- **`searchUsersQuerySchema`** — Extends the orval-generated `SearchUsersBody` with `page`, `pageSize`, `active`, and `deleted` (all from the shared `@infrastructure/http/schemas`). Absent fields stay `undefined`; `normalizePagination` (inside the factory) supplies defaults.
- **`getUsers`** *(exported)* — Built via `createSearchController`. Calls `userService.search(parsed)`, then batch-fetches current roles for the entire page through `rolesOfMany(ids, DEPLOYMENT_TENANT_ID)`, and maps each item through `userService.toUser(user, role)`. Returns `{ items: User[], meta: PaginatedMeta }`.

## Relationships

- **`src/infrastructure/surfaces/create-search-controller.ts`** — Factory that wires validation → `runSearch` → HTTP response. `getUsers` is its sole consumer here.
- **`src/infrastructure/http/schemas.ts`** — Provides `optionalBooleanSchema`, `pageSchema`, `pageSizeSchema` so all search endpoints share identical pagination/filter constraints.
- **`src/modules/users/service.ts`** — `userService.search(parsed)` performs the query; `userService.toUser(user, role)` serializes a user with a role attached.
- **`src/modules/access/index.ts`** — Exports `rolesOfMany`, used to batch-resolve current roles for a list of user IDs in one `$in` query.
- **`src/kernel/access/tenant.ts`** — Supplies `DEPLOYMENT_TENANT_ID`, the tenant scope passed to `rolesOfMany`.
- **`src/infrastructure/persistence/search.ts`** — Source of the `PaginatedMeta` return type.
- **`src/types/index.ts`** — Source of the `User` type used in the response shape.
- **`src/modules/users/routes.ts`** — Mounts `getUsers` on the `GET /users` route.

## Notes

- Roles are **not** read from the user document. `applyUserTransform`'s serialization has no role field, so the controller fetches them separately. The fetch is batched (one `$in` for the whole page) to avoid N+1.
- Items returned by `userService.search` already use `.id` (not `._id`) because `createRepository` normalizes on the way in; the controller reads `user.id` directly.
- `page` / `pageSize` / `active` / `deleted` arrive as **query strings** (GET), not JSON, hence the explicit coercion schemas layered on top of the body-oriented `SearchUsersBody`.
- Do **not** add default values to `searchUsersQuerySchema`; `normalizePagination` inside the factory owns that responsibility.
