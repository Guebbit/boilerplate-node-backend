---
source: src/modules/users/controllers/get-users.ts
sha256: 9c5ac565720f9a6acd7825da69500efe77f22f4590baf663ed04532e52c10de5
generated_at: 2026-11-14T22:19:41.925865+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/get-users.ts

## Purpose

Controller for the admin-facing `GET /users` (query-parameter search) and `POST /users/search` (body search) endpoints. It validates incoming parameters against a Zod schema, delegates to `userService.search`, then transforms raw records into permission-aware `UserListItem` contracts before returning a paginated response.

## Key elements

- **`searchUsersQuerySchema`** — Zod schema that extends the orval-generated `SearchUsersBody` (from `@api/schemas.zod`) with shared pagination fields (`page`, `pageSize`), boolean filters (`active`, `deleted`), and `purchaseHold` / `purchaseHoldReview` restricted to literal `true`. Coerces query strings into proper types so the GET and POST paths share one contract.
- **`getUsers`** *(exported)* — The controller produced by `createSearchController`. Wires the entity name, schema, and a `runSearch` callback that calls `userService.search` then `userService.toUserListItems` (batched for the whole page, using the caller's identity) to produce `{ items: UserListItem[], meta: PaginatedMeta }`.

## Relationships

- **`src/infrastructure/surfaces/create-search-controller.ts`** — Provides the `createSearchController` factory that handles GET/POST dispatch, schema parsing, and response shaping; this file supplies the entity name, schema, and search function.
- **`src/infrastructure/http/schemas.ts`** — Source of `pageSchema`, `pageSizeSchema`, and `optionalBooleanSchema`, ensuring all search endpoints agree on pagination and boolean-filter validation.
- **`src/infrastructure/http/request.ts`** — Source of `callerContextOf`, used to extract the authenticated caller's identity so `toUserListItems` can compute role-specific actions.
- **`src/modules/users/services/index.ts`** — Provides `userService` (`search` + `toUserListItems`), the domain logic behind listing and search.
- **`src/infrastructure/persistence/search.ts`** — Supplies the `PaginatedMeta` type used in the response shape.
- **`src/types/index.ts`** — Supplies the `UserListItem` type that defines the per-row contract returned to the client.
- **`src/modules/users/routes.ts`** — Registers the exported `getUsers` controller on the `/users` route.

## Notes

- The schema intentionally leaves `page`/`pageSize` as *absent* (not defaulted) in the Zod shape; defaulting is owned by `normalizePagination` downstream.
- `purchaseHold` and `purchaseHoldReview` accept only the value `true`. Sending `false` produces a **422**, not a silent no-op — this is an explicit contract choice, not a validation bug.
- `UserListItem` rows carry their *current* role and a computed `actions` array derived from the caller's rank at request time (`toUserListItems`), not from the stored document serialization (`applyUserTransform`).
- Admin-only: the caller is guaranteed to be set because the route sits behind `requirePermission`.
