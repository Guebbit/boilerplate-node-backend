# src/modules/users/controllers/get-users.ts

## Purpose

Controller layer for the admin user-listing endpoint (`GET /users`) and the search endpoint (`POST /users/search`). It defines the query-parameter validation schema, wires it into the shared search-controller factory, and delegates the actual data fetch to `userService.search`.

## Key elements

- **`queryBoolean`** (module-private) — Zod preprocessor that coerces `"true"`/`"false"` query-string values into real booleans. Defined once and reused for `active`, `admin`, and `verified`.
- **`searchUsersQuerySchema`** (module-private) — Extends the orval-generated `SearchUsersBody` with `page`, `pageSize` (from shared HTTP schemas) and the three boolean filters. GET query values arrive as strings, so coercion lives here.
- **`searchUsersKeyParameters`** (exported) — Array of parameter names that affect the response and must participate in the cache key. Derived via `Object.keys(schema.shape)` so any future schema field is automatically included.
- **`getUsers`** (exported) — The route handler, built with `createSearchController({ entity: 'users', schema, runSearch })`. Calls `userService.search(parsed)` on the validated payload.

## Relationships

- **`src/infrastructure/surfaces/create-search-controller.ts`** — Provides the `createSearchController` factory; supplies routing, validation plumbing, and caching for any search endpoint.
- **`src/infrastructure/http/schemas.ts`** — Source of `pageSchema` and `pageSizeSchema`, ensuring all search endpoints share identical pagination constraints.
- **`src/modules/users/service.ts`** — `userService.search(parsed)` is the sole data-access call this controller makes.
- **`src/modules/users/routes.ts`** — Registers `getUsers` as the handler for `GET /users`.

## Notes

- The doc comment references `POST /users/search`, but this file only constructs the GET variant. The POST handler likely lives in a sibling controller or is produced by the same factory with a body schema.
- `searchUsersKeyParameters` is intentionally schema-derived, not hand-listed. Adding a new query field to `searchUsersQuerySchema` automatically extends the cache key; there is no separate list to update.
- Absent `page`/`pageSize` are left as `undefined` here — the shared `normalizePagination` (inside the factory or service) applies defaults. This controller must not fill them in.
- `queryBoolean` is not exported; if another controller needs the same coercion, import from a shared utility rather than duplicating.
