---
source: src/modules/inventory/controllers/get-inventory-levels.ts
sha256: b2b0b8d7902cbb9be956e78fd8ed2f19c5243e8e3c78e5dbe05d3398c80136ed
generated_at: 2026-11-14T20:03:02.195202+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/get-inventory-levels.ts

## Purpose

Controller for `GET /inventory/levels` — the stock-board listing endpoint. It validates and parses query-string parameters (pagination + filters), coerces the `lowOnly` boolean, then delegates to the inventory service to return a page of inventory levels ordered scarcest-first.

## Key elements

- **`getInventoryLevels`** (exported) — the list-controller handler built via `createListController`. Configured with:
  - `entity: 'inventoryLevels'` — identifies the resource in list responses.
  - `schema` — `ListInventoryLevelsQueryParams` extended with `page`/`pageSize` (from shared pagination schemas) and made fully `.partial()` so every param is optional.
  - `input.booleans: ['lowOnly']` — tells the factory to coerce that param from its string representation to a real boolean before calling the service.
  - `runList` — calls `inventoryService.listLevels(parsed)`.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — provides `pageSchema` and `pageSizeSchema`, the shared Zod validators used to type the pagination query params.
- **`src/infrastructure/surfaces/create-list-controller.ts`** — provides the `createListController` factory that assembles validation, boolean coercion, and the HTTP response shape into a single handler.
- **`src/modules/inventory/services/index.ts`** — the services module this file imports `inventoryService` from; the controller's `runList` callback invokes the service with the parsed query params.
- **`src/modules/inventory/routes.ts`** — registers `getInventoryLevels` on the router for the `GET /inventory/levels` path.

## Notes

- Query strings are always text; `lowOnly` is declared in the `input.booleans` array so the factory coerces `"true"`/`"false"` strings before they reach the service. Forgetting this would pass a string where a boolean is expected.
- All query params are optional (`.partial()`), meaning a bare `GET /inventory/levels` with no query string is valid and returns the default first page.
- Ordering ("scarcest first") is not specified here — it lives inside the service layer.
