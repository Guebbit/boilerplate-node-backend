# src/modules/inventory/controllers/get-stock-movements.ts

## Purpose

Builds the `GET /inventory/movements` list controller, returning a paginated, newest-first page of stock-movement ledger entries that can be narrowed by `productId` and `reason`. It is a thin adapter between the HTTP layer and the inventory service.

## Key elements

- **`getStockMovements`** (exported const) — The single public export. Created via `createListController` with:
  - `entity: 'stockMovements'` — identifies the resource for the list-controller harness.
  - `schema` — `ListStockMovementsQueryParams` extended with `page` / `pageSize` (both optional via `.partial()`), producing the full query-string contract.
  - `input.ids: ['productId']` — flags `productId` as the id field the harness resolves/validates.
  - `runList` — delegates to `inventoryService.listMovements(parsed)`.

## Relationships

- **`src/infrastructure/surfaces/create-list-controller.ts`** — Supplies the `createListController` factory that wires schema validation, id extraction, and list execution into a ready-to-mount HTTP handler.
- **`src/infrastructure/http/schemas.ts`** — Source of `pageSchema` and `pageSizeSchema`, injected into the query-param schema to add pagination.
- **`src/modules/inventory/service.ts`** — Provides `inventoryService.listMovements`, the domain operation that actually fetches and orders the movements.
- **`src/modules/inventory/routes.ts`** — Registers `getStockMovements` on the `GET /inventory/movements` path, making it reachable by clients.

## Notes

- The query-param schema is built with `.extend(...).partial()`, meaning **every** field—including the ones inherited from `ListStockMovementsQueryParams`—is optional at the query-string level. Filtering by `productId` or `reason` is therefore always optional.
- `input.ids` is declared as `['productId']` even though the endpoint lists *movements* (not products). This tells the list-controller harness which query param to treat as a foreign-key id for resolution/authorization; it does not mean the list is scoped to a single product.
