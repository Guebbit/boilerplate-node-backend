---
source: src/modules/inventory/controllers/get-inventory-levels.ts
sha256: 93a36a9bcc8c565b8f053eac6b2227cbb3c7b3a3114059b4404951fe401cb5c5
generated_at: 2026-09-23T18:43:34.865061+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/get-inventory-levels.ts

## Purpose

Thin HTTP controller that exposes `GET /inventory/levels` — a paginated, sorted (scarcest-first) stock-board listing. It validates query-string parameters and delegates to the inventory service, keeping routing logic out of the service layer.

## Key elements

- **`getInventoryLevels`** (named export) — the list-controller produced by `createListController`. Binds entity name `'inventoryLevels'`, a zod schema for query params, boolean coercion config, and the `runList` callback that calls `inventoryService.listLevels(parsed)`.
- **Schema** — `ListInventoryLevelsQueryParams.extend({ page: pageSchema, pageSize: pageSizeSchema }).partial()`. Pagination fields are added here rather than living on the shared query-param type, and `.partial()` makes every field optional at the HTTP boundary.
- **`input: { booleans: ['lowOnly'] }`** — tells the controller factory to coerce the `lowOnly` query-string value (text `"true"`/`"false"`) into a real boolean before passing it to the service.

## Relationships

- **`@infrastructure/surfaces/create-list-controller`** — factory that builds the Express-style handler, wiring validation, boolean coercion, and pagination around the `runList` callback supplied here.
- **`@infrastructure/http/schemas`** — provides `pageSchema` and `pageSizeSchema` (zod validators) that this file merges into the query-param schema.
- **`../service`** (`inventory/service.ts`) — `inventoryService.listLevels(parsed)` is the sole data-access call; all business logic lives there.
- **`./routes`** (`modules/inventory/routes.ts`) — registers `getInventoryLevels` on the `GET /inventory/levels` route (this file is the handler it mounts).

## Notes

- `lowOnly` is the only boolean in the param set; the comment in the source flags that query strings are always text, so the controller layer must handle the coercion explicitly via the `input.booleans` config.
- The schema is built with `.extend(...).partial()`, meaning *all* fields (including the original `ListInventoryLevelsQueryParams` fields) are optional at the HTTP layer. Do not assume any field is required.
- The entity string `'inventoryLevels'` is used by the list-controller for logging / OpenAPI naming; keep it in sync with the service's internal collection if it changes.
