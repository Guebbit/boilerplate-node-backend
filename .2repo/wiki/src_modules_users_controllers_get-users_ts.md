# src/modules/users/controllers/get-users.ts

## Purpose

Handler for `GET /users`: an admin-only endpoint that searches/lists users by query parameters (pagination, `active`, `admin`, `verified`). It validates the query string against a zod schema, delegates to `userService.search`, and writes a standard success/error response.

## Key elements

- **`GetUsersQuery`** (exported type) — Partial string-valued record keyed by `SearchUsersRequest` fields; models the raw query-string surface of the route.
- **`queryBoolean`** (internal) — `z.preprocess` that coerces `"true"`/`"false"` strings to booleans before passing to `z.boolean().optional()`. Used by the three filter fields.
- **`searchUsersQuerySchema`** (internal) — Extends the orval-generated `SearchUsersBody` with `page`, `pageSize`, and the three boolean filters. All validation for this endpoint lives here.
- **`searchUsersKeyParameters`** (exported const) — `Object.keys(searchUsersQuerySchema.shape)`; the canonical list of query params that affect the response (and thus the cache key). Derived from the schema to prevent drift.
- **`getUsers`** (exported handler) — Express handler that reads input via `readInput`, validates with `parseBody`, calls `userService.search`, and responds with `successResponse` or `catchAs`.

## Relationships

- **`src/modules/users/routes.ts`** — registers `getUsers` as the handler for the `GET /users` route.
- **`src/modules/users/service.ts`** — provides `userService.search(parsed)`; the sole domain operation this controller invokes.
- **`src/infrastructure/http/controller.ts`** — supplies `parseBody` (schema-validate-and-respond) and `catchAs` (error serialization) used in the handler.
- **`src/infrastructure/http/request.ts`** — supplies `readInput`, which assembles the request input object from the declared surface.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` for the happy-path reply.
- **`src/infrastructure/http/schemas.ts`** — supplies `pageSchema` and `pageSizeSchema`, shared across all four search endpoints to keep pagination rules consistent.
- **`src/types/index.ts`** — provides the `SearchUsersRequest` type that shapes the validated payload passed to the service.

## Notes

- Query booleans arrive as strings (`"true"`/`"false"`); `queryBoolean` handles the coercion. JSON-style booleans in the query string would pass through the `typeof` guard unchanged.
- `page`/`pageSize` are optional in the schema by design — `normalizePagination` (downstream, in the service layer) owns the defaults. The controller must not fill them in.
- `searchUsersKeyParameters` is derived from the schema shape, not hand-listed. If you add a field to `searchUsersQuerySchema`, the cache-key list updates automatically; do not duplicate the list elsewhere.
- The `readInput` call uses `{ surface: 'search', ids: ['id'] }` — see `docs/theory/request-input.md` for the contract.
- The route is admin-only (per the JSDoc); enforcement is expected upstream (middleware or route guard in `routes.ts`), not in this file.
