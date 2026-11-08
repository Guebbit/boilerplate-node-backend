---
source: src/modules/users/controllers/get-users.ts
sha256: 1bfa1b9700cc717de558d1c87595100b6194fb270150fe7b461d940a083e03d2
generated_at: 2026-11-08T08:44:18.481617+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/get-users.ts

## Purpose

Defines the controller for `GET /users` (and the corresponding `POST /users/search` surface). It validates incoming query parameters or body, delegates the actual search to `userService`, and post-processes each row through `userService.toUserContracts` so that the caller's role and allowed actions are resolved per-request before the response is returned.

## Key elements

- **`searchUsersQuerySchema`** — Extends the orval-generated `SearchUsersBody` (from `@api/schemas.zod`) with shared pagination fields (`pageSchema`, `pageSizeSchema`), `active`/`deleted` optional booleans, and two `purchaseHold*` fields pipe'd to `z.literal(true).optional()`.
- **`getUsers`** (exported) — Built via `createSearchController`; wires `schema` validation to a `runSearch` callback that calls `userService.search(parsed)` then maps results through `userService.toUserContracts(items, caller)`. Returns `{ items, meta }`.

## Relationships

- **`src/modules/users/services/index.ts`** — Consumes `userService.search` and `userService.toUserContracts` to perform the query and per-row contract transformation.
- **`src/infrastructure/surfaces/create-search-controller.ts`** — Provides the `createSearchController` factory that handles HTTP method dispatch, schema parsing, and error shaping around `getUsers`.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf(request)` to extract the authenticated caller identity passed into `toUserContracts`.
- **`src/infrastructure/http/schemas.ts`** — Source of `optionalBooleanSchema`, `pageSchema`, `pageSizeSchema` so this endpoint agrees with every other search endpoint on legal values.
- **`src/infrastructure/persistence/search.ts`** — Exports the `PaginatedMeta` type used in the controller's return shape.
- **`src/types/index.ts`** — Provides the `User` domain type referenced in the `runSearch` return signature.
- **`src/modules/users/routes.ts`** — Registers `getUsers` on the HTTP router (downstream consumer of this module's export).

## Notes

- `purchaseHold` and `purchaseHoldReview` accept **only** `true`; passing `false` is a 422, not a no-op. This is intentional per the API contract (there is no "not held" list endpoint).
- The schema deliberately leaves `page`/`pageSize` *optional* (no defaults here); `normalizePagination` inside the search infrastructure owns default values.
- `toUserContracts` is called once for the entire page (batched), not per row, to avoid N queries for role/action resolution.
- The file relies on `requirePermission` (upstream middleware) to guarantee the caller is present; the controller does not re-check authorization itself.
