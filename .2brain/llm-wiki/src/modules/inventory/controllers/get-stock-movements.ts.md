---
source: src/modules/inventory/controllers/get-stock-movements.ts
sha256: 62aec4c0a7d5690e087fd37e0abc17a09d981ce639b9fe7540e438b0b94b6b6f
generated_at: 2026-11-08T05:57:37.319912+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/get-stock-movements.ts

## Purpose

Exposes the `GET /inventory/movements` endpoint as a paginated, filterable listing of stock-movement records (newest first). It exists to wire the HTTP layer to the inventory domain service without the caller needing to know the service's internal signature.

## Key elements

- **`getStockMovements`** (exported const) — the controller built by `createListController`. Accepts optional query params (see schema below) and delegates to `inventoryService.listMovements`.
- **Schema** — `ListStockMovementsQueryParams` extended with `page` and `pageSize` (both from the shared HTTP schemas), then made `.partial()` so every filter is optional.
- **`input.ids: ['productId']`** — flags `productId` as an ID-type parameter for the list-controller helper (e.g., for casting or validation).

## Relationships

- **`src/infrastructure/surfaces/create-list-controller.ts`** — provides the `createListController` factory that turns the config object into a ready-to-mount HTTP handler.
- **`src/infrastructure/http/schemas.ts`** — supplies the shared `pageSchema` and `pageSizeSchema` used to define the pagination params.
- **`src/modules/inventory/services/index.ts`** — exports `inventoryService`; the controller calls its `listMovements` method with the parsed query params.
- **`src/modules/inventory/routes.ts`** — imports `getStockMovements` and mounts it at the `/inventory/movements` route.

## Notes

- The `.partial()` call means *all* query params (including `page`/`pageSize`) are optional; the list-controller presumably applies default pagination when they are absent.
- `productId` is declared under `input.ids`, so the controller helper may treat it differently from other filter fields (e.g., numeric ID validation). Be aware when adding new ID-like filters.
