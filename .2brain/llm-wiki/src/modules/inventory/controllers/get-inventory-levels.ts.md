---
source: src/modules/inventory/controllers/get-inventory-levels.ts
source_sha256: b2b0b8d7902cbb9be956e78fd8ed2f19c5243e8e3c78e5dbe05d3398c80136ed
context_sha256: d00a3232c4b3e1d8f96c9519b57694f8be96d10c8b0f1e5c269f74a91b38c295
generated_at: 2026-11-22T05:16:47.361155+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/controllers/get-inventory-levels.ts

## Purpose
Controller for `GET /inventory/levels`. It returns a page of the stock board, listing every counter and its availability with the scarcest first. It is built with the shared list-controller factory, so it only declares the entity name, the query schema, and the service call.

## Key elements
- `getInventoryLevels`: the exported controller, created by `createListController` with:
  - `entity: 'inventoryLevels'`.
  - `schema`: `ListInventoryLevelsQueryParams` (from `@api/schemas.zod`), extended with `page` (`pageSchema`) and `pageSize` (`pageSizeSchema`), then made `.partial()`, so every query parameter is optional.
  - `input: { booleans: ['lowOnly'] }`: marks `lowOnly` as a boolean parsed from query-string text.
  - `runList`: calls `inventoryService.listLevels(parsed)` with the parsed query.

## Relationships
- `src/infrastructure/http/schemas.ts`: supplies `pageSchema` and `pageSizeSchema` for pagination.
- `src/infrastructure/surfaces/create-list-controller.ts`: supplies the `createListController` factory that builds the handler.
- `src/modules/inventory/services/index.ts`: supplies `inventoryService`, whose `listLevels` method does the actual listing.
- `src/modules/inventory/routes.ts`: a graph neighbor of this file. The route registration is not visible here, but this controller is the handler for the `GET /inventory/levels` route.

## Notes
- The `page` and `pageSize` fields are overridden on top of the generated API schema. Because of `.partial()`, all query fields, including the paging ones, are optional.
- `lowOnly` needs the explicit `booleans` entry because a query string can only carry it as text.
