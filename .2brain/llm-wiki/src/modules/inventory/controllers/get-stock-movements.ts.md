---
source: src/modules/inventory/controllers/get-stock-movements.ts
sha256: 9c4b474bfcbbdb66cd379ce6b72a545853fbf200f3a1fa2b44c61c1a2ec1ab1e
generated_at: 2026-09-23T18:43:42.674946+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/get-stock-movements.ts

## Purpose

Defines the HTTP controller for `GET /inventory/movements`, which returns a paginated list of stock-movement ledger entries (newest first), optionally filtered by `productId` and `reason`. It exists to decouple the route wiring from the query logic by delegating to `inventoryService.listMovements`.

## Key elements

- **`getStockMovements`** (exported const) — the list controller built via `createListController`. It declares:
    - `entity: 'stockMovements'` — the resource name used for response shaping/logging.
    - `schema` — `ListStockMovementsQueryParams` extended with `page` / `pageSize` (both made optional via `.partial()`).
    - `input: { ids: ['productId'] }` — tells the controller harness to treat `productId` as an ID-style parameter (likely validated as an ID rather than a free-text filter).
    - `runList` — the single async call to `inventoryService.listMovements(parsed)`.

## Relationships

- **`src/infrastructure/surfaces/create-list-controller.ts`** — Provides the `createListController` factory that `getStockMovements` is built from. Handles pagination defaults, response envelope, and error wrapping so this file stays declarative.
- **`src/infrastructure/http/schemas.ts`** — Source of `pageSchema` and `pageSizeSchema`, which are mixed into the query-param schema here.
- **`src/modules/inventory/service.ts`** — Exposes `inventoryService.listMovements`, the actual data-access call the controller delegates to.
- **`src/modules/inventory/routes.ts`** — Registers `getStockMovements` on the `GET /inventory/movements` path (the only consumer of this export).

## Notes

- The schema is `.partial()`-ed, meaning every query parameter (including `page` and `pageSize`) is optional at the route level; defaults are presumably supplied by `createListController` or the service.
- `productId` is passed through the `ids` config key rather than a generic filter field, which likely triggers ID-format validation in the controller harness. Treat it as a hard constraint, not a free-text search.
