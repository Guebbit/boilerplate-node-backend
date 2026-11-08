---
source: src/modules/inventory/controllers/get-inventory-levels.ts
sha256: f87e94e80be8f82686b6bb546d02a09be73ada696f13eef4bdc161b5dfd1622c
generated_at: 2026-11-08T05:57:22.301548+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/get-inventory-levels.ts

## Purpose

Controller for `GET /inventory/levels`. Returns a paginated list of inventory levels (counters and availability, scarcest first) by delegating to the inventory service. It exists to wire the HTTP query parameters into the service layer through the shared list-controller factory.

## Key elements

- **`getInventoryLevels`** (exported const) — The HTTP handler for `GET /inventory/levels`. Built via `createListController` with entity name `'inventoryLevels'`, a Zod schema (base params + `page`/`pageSize`, all made optional via `.partial()`), boolean coercion for `lowOnly`, and `inventoryService.listLevels` as the list runner.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — Imports `pageSchema` and `pageSizeSchema` to compose the pagination portion of the query schema.
- **`src/infrastructure/surfaces/create-list-controller.ts`** — Provides the `createListController` factory that produces the controller (handles parsing, validation, pagination plumbing, and response shaping).
- **`src/modules/inventory/services/index.ts`** — Imports `inventoryService`; the controller calls `inventoryService.listLevels(parsed)` to fetch data.
- **`src/modules/inventory/routes.ts`** — Consumer of this controller; registers `getInventoryLevels` on the inventory route for the `/levels` path.

## Notes

- The `input: { booleans: ['lowOnly'] }` option is required because query strings are always text; the factory coerces `"true"`/`"false"` strings to actual booleans before the schema parses them.
- Calling `.partial()` on the extended schema means **every** query parameter is optional—there is no required field on this endpoint.
