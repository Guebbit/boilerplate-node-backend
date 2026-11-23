---
source: src/modules/inventory/controllers/get-stock-movements.ts
source_sha256: 62aec4c0a7d5690e087fd37e0abc17a09d981ce639b9fe7540e438b0b94b6b6f
context_sha256: d00a3232c4b3e1d8f96c9519b57694f8be96d10c8b0f1e5c269f74a91b38c295
generated_at: 2026-11-22T05:17:05.122987+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/controllers/get-stock-movements.ts

## Purpose
Controller for `GET /inventory/movements`. It returns a page of the stock ledger, newest first, narrowed by the `productId` and `reason` query parameters. It does this by configuring the shared list-controller factory with this endpoint's schema and service call.

## Key elements
- `getStockMovements`: the exported controller, built with `createListController`.
  - `entity: 'stockMovements'` names the entity being listed.
  - `schema` is `ListStockMovementsQueryParams` (from `@api/schemas.zod`), extended with `pageSchema` and `pageSizeSchema` for `page` and `pageSize`, then made `.partial()`, so every query parameter is optional.
  - `input: { ids: ['productId'] }` declares `productId` as an id-type input.
  - `runList` passes the parsed query to `inventoryService.listMovements(parsed)`.

## Relationships
- `src/infrastructure/http/schemas.ts`: provides `pageSchema` and `pageSizeSchema`, used to extend the query schema.
- `src/infrastructure/surfaces/create-list-controller.ts`: provides `createListController`, which builds the controller from the config above.
- `src/modules/inventory/services/index.ts`: provides `inventoryService`. `listMovements` does the actual data retrieval.
- `src/modules/inventory/routes.ts`: a graph neighbor of this file. It presumably mounts `getStockMovements` on the route. That wiring is not visible in this file.

## Notes
- The file has no handler logic of its own. Parsing, pagination and response shaping are done by `createListController`, and the file's content does not show how.
- `.partial()` is applied after `.extend(...)`, so `page` and `pageSize` are optional as well.
- Newest-first ordering is stated in the module doc comment. This file does not implement it, so it must come from the service or the list controller.
