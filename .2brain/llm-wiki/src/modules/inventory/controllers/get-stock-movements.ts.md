---
source: src/modules/inventory/controllers/get-stock-movements.ts
sha256: 62aec4c0a7d5690e087fd37e0abc17a09d981ce639b9fe7540e438b0b94b6b6f
generated_at: 2026-10-15T10:33:59.451928+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/get-stock-movements.ts

## Purpose

HTTP controller that handles `GET /inventory/movements`, returning a paginated list of stock-movement ledger entries (newest first) that can be narrowed by `productId` and `reason`. It is a thin adapter that wires the query-parameter schema to the inventory service.

## Key elements

- **`getStockMovements`** (exported const) — The sole export. Built via `createListController` with:
  - `entity: 'stockMovements'` — used for response shaping / naming conventions in the list-controller factory.
  - `schema` — `ListStockMovementsQueryParams` (from `@api/schemas.zod`) extended with `page` and `pageSize` (from the shared HTTP schemas), then made `.partial()` so every param is optional.
  - `input: { ids: ['productId'] }` — instructs the list controller to treat `productId` as an ID lookup rather than a generic filter.
  - `runList` — delegates to `inventoryService.listMovements(parsed)`.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — Provides `pageSchema` and `pageSizeSchema`, the shared pagination query-param validators mixed into this controller's schema.
- **`src/infrastructure/surfaces/create-list-controller.ts`** — Factory this file calls to produce the final Express handler; handles param parsing, pagination bookkeeping, and response envelope.
- **`src/modules/inventory/services/index.ts`** — Exports `inventoryService`; this controller calls its `listMovements` method with the parsed query object.
- **`src/modules/inventory/routes.ts`** — Registers `getStockMovements` on the `GET /inventory/movements` route.

## Notes

- `productId` is flagged via `input.ids`, which tells the list-controller to resolve it through an ID lookup path (distinct from arbitrary filter fields). Forgetting this flag would change how the param is interpreted.
- The `reason` filter is not defined here; it is inherited from `ListStockMovementsQueryParams` in `@api/schemas.zod`. Add or rename it there, not in this file.
- All query parameters are optional (`.partial()`), so a bare `GET /inventory/movements` with no query string is valid and returns the first page.
