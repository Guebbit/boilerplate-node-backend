---
source: src/modules/users/controllers/get-users.ts
sha256: 1bfa1b9700cc717de558d1c87595100b6194fb270150fe7b461d940a083e03d2
generated_at: 2026-10-29T06:11:36.026794+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/get-users.ts

## Purpose

Admin-facing controller that handles `GET /users` (query-parameter search) and `POST /users/search` (body search). It validates incoming pagination and filter params against a Zod schema, delegates to `userService.search`, then enriches the resulting rows via `userService.toUserContracts` so each user carries its current role and the `actions` the caller's rank permits.

## Key elements

- **`searchUsersQuerySchema`** — Zod schema built by extending the orval-generated `SearchUsersBody` with `page`, `pageSize`, `active`, `deleted`, `purchaseHold`, and `purchaseHoldReview`. The two `purchaseHold*` fields are further constrained to `literal(true).optional()` so a `false` value yields a 422 rather than a silent no-op.
- **`getUsers`** (export) — The search controller created via `createSearchController({ entity: 'users', schema, runSearch })`. `runSearch` calls `userService.search(parsed)`, then maps results through `userService.toUserContracts(items, caller)` before returning `{ items: User[], meta: PaginatedMeta }`.

## Relationships

- **`@infrastructure/surfaces/create-search-controller`** — Factory that wraps validation, error handling, and response shaping; this file supplies the entity name, schema, and the async `runSearch` callback.
- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts the authenticated caller (set upstream by `requirePermission`) and passes it into `toUserContracts` for per-caller role/action computation.
- **`@infrastructure/http/schemas`** — Source of the shared `pageSchema`, `pageSizeSchema`, and `optionalBooleanSchema` so all search endpoints agree on legal values.
- **`@modules/users/services`** — `userService` provides both `search` (filtering + pagination) and `toUserContracts` (role/action enrichment, batched per page).
- **`@infrastructure/persistence/search`** — Contributes the `PaginatedMeta` type used in the return shape.
- **`@types`** — Contributes the `User` entity type used in the return annotation.
- **`@modules/users/routes`** — Imports `getUsers` and mounts it on the route table.

## Notes

- `page` / `pageSize` / `active` are **string-coerced** because they arrive as query text on GET, not JSON. Defaults are *not* applied here; `normalizePagination` (inside the search controller or service) owns defaulting.
- `purchaseHold` and `purchaseHoldReview` intentionally accept **only `true`** (or absent). Sending `false` is a 422, by design—there is no "not held" listing.
- The doc header references `docs/modules/users.md` for broader context.
- `toUserContracts` is called **after** the raw search, batched over the whole page, because the persistence layer's serialization has no caller context to derive roles/actions.
