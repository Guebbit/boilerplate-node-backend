---
source: src/modules/users/controllers/get-users.ts
sha256: 856dc746f4dc2ef38e5a257099bffdf346ae5c8f4bce92b2f113a414e5835bad
generated_at: 2026-10-15T12:07:10.401666+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/get-users.ts

## Purpose

Controller that exposes the admin-facing `GET /users` endpoint (and its `POST /users/search` counterpart) for listing and searching users via query parameters or a JSON body. It delegates the actual lookup to the users service and post-processes results into per-caller contracts before returning.

## Key elements

- **`searchUsersQuerySchema`** — Extends the orval-generated `SearchUsersBody` with `page`, `pageSize`, `active`, and `deleted` fields drawn from the shared HTTP schemas, so this endpoint enforces the same pagination/boolean rules as every other search surface.
- **`getUsers`** (export) — A search controller produced by `createSearchController`. Its `runSearch` calls `userService.search(parsed)` and then maps the raw `User[]` through `userService.toUserContracts(items, request.caller)` to attach the caller's current role and permitted actions. Returns `{ items, meta }` shaped as `User[]` + `PaginatedMeta`.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — Source of `optionalBooleanSchema`, `pageSchema`, and `pageSizeSchema` used to build `searchUsersQuerySchema`.
- **`src/infrastructure/surfaces/create-search-controller.ts`** — Factory that `getUsers` is instantiated from; provides the HTTP wiring (method selection, validation, response shaping) around the `runSearch` callback.
- **`src/infrastructure/persistence/search.ts`** — Supplies the `PaginatedMeta` type used in the controller's declared return shape.
- **`src/modules/users/services/index.ts`** — Provides `userService.search` (the data lookup) and `userService.toUserContracts` (role/action enrichment).
- **`src/modules/users/routes.ts`** — Registers `getUsers` on the `/users` route (the consumer of this export).
- **`src/types/index.ts`** — Source of the `User` domain type referenced in the `runSearch` return annotation.

## Notes

- `page`, `pageSize`, and `active` arrive as **strings** in a GET query; the shared schemas handle coercion. The schema intentionally leaves them *optional* — `normalizePagination` (inside `createSearchController`) is responsible for applying defaults, not the schema.
- `request.caller` is guaranteed to be populated because the route sits behind `requirePermission`; `toUserContracts` relies on it to compute per-caller `actions`.
- Role and action data are **not** stored on the serialized user document; `toUserContracts` fetches them fresh (batched for the whole page) because `applyUserTransform`'s own serialization carries no role information.
