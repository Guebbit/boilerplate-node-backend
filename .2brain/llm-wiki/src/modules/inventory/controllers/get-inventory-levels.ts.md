---
source: src/modules/inventory/controllers/get-inventory-levels.ts
sha256: f87e94e80be8f82686b6bb546d02a09be73ada696f13eef4bdc161b5dfd1622c
generated_at: 2026-10-15T10:33:43.707993+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/get-inventory-levels.ts

## Purpose

Controller for `GET /inventory/levels` — returns a paginated list of inventory levels (stock counters and availability, scarcest first). It is a thin layer that parses/validates query params and delegates to the inventory service.

## Key elements

- **`getInventoryLevels`** (default export) — The HTTP handler built with `createListController`. Configures:
  - `entity: 'inventoryLevels'` — identifies the resource type for the generic list machinery.
  - `schema` — `ListInventoryLevelsQueryParams` (from `@api/schemas.zod`) extended with `page` and `pageSize` (from `pageSchema` / `pageSizeSchema`), then made `.partial()` so every param is optional.
  - `input: { booleans: ['lowOnly'] }` — tells the factory to coerce the text-only `lowOnly` query value into a real boolean before passing it to the service.
  - `runList` — calls `inventoryService.listLevels(parsed)` and returns the result.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — Provides `pageSchema` and `pageSizeSchema`, the shared Zod validators for standard pagination params appended to the endpoint schema.
- **`src/infrastructure/surfaces/create-list-controller.ts`** — Supplies the `createListController` factory that handles request parsing, boolean coercion, and response shaping; this file only supplies the config object.
- **`src/modules/inventory/routes.ts`** — Wires `getInventoryLevels` onto the `GET /inventory/levels` route.
- **`src/modules/inventory/services/index.ts`** — Exports `inventoryService`, whose `listLevels` method performs the actual data retrieval.

## Notes

- All query parameters are optional (`.partial()`), so a bare `GET /inventory/levels` with no query string is valid.
- `lowOnly` is the only param needing type coercion; the factory handles the conversion internally based on the `booleans` hint — you don't see a manual `String → boolean` cast in this file.
- The `entity` string is a label for the list-controller's logging/responses, not a DB table name.
