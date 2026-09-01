# src/modules/orders/controllers/get-orders.ts

## Purpose
Thin wiring layer that exposes a `GET /orders` search/list endpoint. It delegates all search logic to `orderService.search` through the shared `createSearchController` factory, while enforcing caller visibility: non-admin users are scoped to their own orders and cannot filter by an arbitrary `userId`.

## Key elements
- **`searchOrdersQuerySchema`** — Extends the orval-generated `SearchOrdersBody` with `page` and `pageSize` (from `@infrastructure/http/schemas`). Absent values remain absent so downstream `normalizePagination` can apply defaults.
- **`searchOrdersKeyParameters`** (exported) — Array of query-parameter names, derived via `Object.keys(schema.shape)`. Intended for building cache keys; derived from the schema so it cannot drift from the actual validated fields.
- **`getOrders`** (exported) — The HTTP controller. Created by `createSearchController` with:
  - `entity: 'orders'`
  - `extendInput` — Strips `userId` to `undefined` for non-admin callers before the query runs.
  - `runSearch` — Calls `orderService.search(parsed, callerScope, callerContext)`, passing the parsed input, the caller's visibility scope, and the raw caller context.

## Relationships
- **`src/modules/orders/service.ts`** — Source of `orderService`; this controller calls its `search` and `callerScope` methods.
- **`src/infrastructure/surfaces/create-search-controller.ts`** — Provides the `createSearchController` factory that structures this file's export (parsing, validation, and response handling).
- **`src/infrastructure/http/request.ts`** — Source of `callerContextOf`, used to extract the caller context handed to `orderService.search`.
- **`src/infrastructure/http/schemas.ts`** — Source of `pageSchema` and `pageSizeSchema`, ensuring pagination coercion matches every other search endpoint.
- **`src/modules/orders/routes.ts`** — Consumes the `getOrders` export to register the `GET /orders` route.

## Notes
- `userId` filtering is silently dropped for non-admin callers (set to `undefined` in `extendInput`), not rejected with a 400. The enforcement is by omission, not by an error response.
- `searchOrdersKeyParameters` is meant to be the single source of truth for cache-key construction on this endpoint; do not hand-maintain a parallel list elsewhere.
- The file does no business logic itself — all domain rules live in `orderService`; the controller only wires input scoping and delegation.
