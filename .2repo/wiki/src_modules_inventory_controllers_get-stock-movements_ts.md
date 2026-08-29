# src/modules/inventory/controllers/get-stock-movements.ts

## Purpose

HTTP controller for `GET /inventory/movements`. It reads and validates query-string parameters (pagination, `productId`, `reason`), delegates to the inventory service, and returns a single page of stock-movement records (newest first).

## Key elements

- **`movementsQuerySchema`** (module-level constant) — Extends `ListStockMovementsQueryParams` (from `@api/schemas.zod`) with shared `pageSchema` / `pageSizeSchema`, then calls `.partial()`. Used as the Zod validator for the request input.
- **`getStockMovements`** (exported) — Express handler. Calls `readInput` with `surface: 'list'` and `ids: ['productId']`, validates via `movementsQuerySchema.safeParse`, then calls `inventoryService.listMovements`. On failure returns early with `rejectValidation`; on success sends `successResponse`; errors are handled by `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `catchAs` (async error wrapper) and `rejectValidation` (400 response helper) used in the handler's error paths.
- **`src/infrastructure/http/request.ts`** — Supplies `readInput`, which extracts and normalizes the query payload in one call.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse` for the 200 reply.
- **`src/infrastructure/http/schemas.ts`** — Supplies `pageSchema` and `pageSizeSchema` so this endpoint stays consistent with every other paged endpoint in the project.
- **`src/modules/inventory/routes.ts`** — Registers `getStockMovements` as the handler for the `GET /inventory/movements` route.
- **`src/modules/inventory/service.ts`** — Provides `inventoryService.listMovements`, which performs the actual data fetch and pagination.

## Notes

- `readInput` is called with `surface: 'list'` (not `'search'`) because this is a bodyless GET; the query string is the sole input source. See `docs/theory/request-input.md` for the convention.
- The schema is `.partial()` on purpose: absent pagination fields remain absent here. Default values are applied downstream by `normalizePagination` in the service layer, keeping a single owner of defaults.
- `productId` is declared in the `ids` array of `readInput`, signalling it is a resource identifier rather than a free-text filter.
