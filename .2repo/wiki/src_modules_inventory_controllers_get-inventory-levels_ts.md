# src/modules/inventory/controllers/get-inventory-levels.ts

## Purpose

Route handler for `GET /inventory/levels`. Reads a paginated, optionally-filtered query string, validates it, and delegates to the inventory service to return a page of stock levels (counters + availability, scarcest first).

## Key elements

- **`levelsQuerySchema`** (module-level const) — Built by extending the generated `ListInventoryLevelsQueryParams` with `page`/`pageSize` from the shared pagination schemas, then calling `.partial()` so every field is optional. Validation is a hard gate before the service is called.
- **`getInventoryLevels(request, response)`** (exported) — The Express handler. Reads input via `readInput` (surface `'list'`, booleans `['lowOnly']`), safe-parses against `levelsQuerySchema`, then calls `inventoryService.listLevels` and responds with `successResponse` or an error via `catchAs`.

## Relationships

- **`@infrastructure/http/request`** — `readInput` normalises the raw query string (handles the `lowOnly` text-to-boolean conversion) before validation.
- **`@infrastructure/http/schemas`** — `pageSchema` / `pageSizeSchema` supply the shared pagination constraints so all paged endpoints stay consistent.
- **`@infrastructure/http/controller`** — `rejectValidation` short-circuits with a 422 on schema failure; `catchAs` formats any downstream service error into the standard error response.
- **`@infrastructure/http/response`** — `successResponse` wraps the service result in the canonical success envelope.
- **`../service`** — `inventoryService.listLevels` performs the actual data retrieval; this controller never touches the repository directly.
- **`../routes`** — Registers `getInventoryLevels` on the `GET /inventory/levels` path.

## Notes

- The schema is intentionally `.partial()`: absent pagination fields are left `undefined` so that `normalizePagination` (downstream in the service) owns the defaults. Don't add defaults here.
- `surface: 'list'` is used because there is no `POST /inventory/levels/search` sibling; the query string is the sole input surface.
- `lowOnly` is the only boolean filter and arrives as a string in the query string — `readInput` converts it; do not add a manual `=== 'true'` check in the handler.
