---
source: src/modules/inventory/controllers/get-preorder-levels.ts
sha256: e8a93d75935bc8ada6a819856150cb011689ded1eb88a49f29483a7d3accd736
generated_at: 2026-10-15T10:33:50.496052+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/get-preorder-levels.ts

## Purpose

Controller for `GET /inventory/preorders`. Returns a paginated view of the preorder board: each product's allowance, outstanding quantity, and the split between paid and unpaid orders. Exists to translate the HTTP query layer into a single service call via the shared list-controller factory.

## Key elements

- **`getPreorderLevels`** (exported) — A list controller built with `createListController`. Declares entity `'preorderLevels'`, validates query params, and delegates to `inventoryService.listPreorders(parsed)`.
- **Query schema** — `ListPreorderLevelsQueryParams.extend({ page, pageSize }).partial()`. All fields are optional (`.partial()`), with pagination supplied by the shared `pageSchema`/`pageSizeSchema`.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — Provides `pageSchema` and `pageSizeSchema` used to compose the pagination part of the query schema.
- **`src/infrastructure/surfaces/create-list-controller.ts`** — Factory that wires up validation, pagination extraction, and response shaping; this file passes its config object to that factory.
- **`src/modules/inventory/services/index.ts`** — Source of `inventoryService`; the controller calls `inventoryService.listPreorders` for the actual data fetch.
- **`src/modules/inventory/routes.ts`** — Registers `getPreorderLevels` on the `GET /inventory/preorders` route.

## Notes

- Every query param is optional (`.partial()`), so a bare `GET /inventory/preorders` with no query string is valid and will return the default page.
- The controller contains no business logic; filtering, sorting, and aggregation all live in `inventoryService.listPreorders`.
