---
source: src/modules/inventory/controllers/get-preorder-levels.ts
sha256: e8a93d75935bc8ada6a819856150cb011689ded1eb88a49f29483a7d3accd736
generated_at: 2026-11-08T05:57:29.818671+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/get-preorder-levels.ts

## Purpose

Controller for `GET /inventory/preorders`. Returns a paginated list of preorder levels — each product's allowance and the outstanding balance split between paid and unpaid orders. Exists to expose this read-only board view via the inventory module's HTTP surface.

## Key elements

- **`getPreorderLevels`** — the sole export. Built with the `createListController` factory. Accepts optional `page` / `pageSize` query params (plus any fields from `ListPreorderLevelsQueryParams`), validates them, then delegates to `inventoryService.listPreorders`. The `entity` key is set to `'preorderLevels'` (used by the factory for logging / response shaping).

## Relationships

- **`src/infrastructure/http/schemas.ts`** — provides `pageSchema` and `pageSizeSchema`, which are mixed into the query-param schema for standard pagination.
- **`src/infrastructure/surfaces/create-list-controller.ts`** — supplies the `createListController` factory that wires up validation, pagination defaults, and the standard list-response envelope around the thin `runList` callback defined here.
- **`src/modules/inventory/services/index.ts`** — source of `inventoryService`; its `listPreorders` method is the actual data-fetching call invoked at request time.
- **`src/modules/inventory/routes.ts`** — registers this controller on the `GET /inventory/preorders` route.

## Notes

- The query schema is `.partial()`, so every field (including `page` and `pageSize`) is optional; the `createListController` factory is expected to supply sensible pagination defaults when they are absent.
- The controller is intentionally thin — all HTTP concerns (validation, error mapping, pagination math) live in `createListController`; the only business logic here is the one-line `runList` delegation.
