---
source: src/modules/inventory/controllers/get-preorder-levels.ts
source_sha256: e8a93d75935bc8ada6a819856150cb011689ded1eb88a49f29483a7d3accd736
context_sha256: d00a3232c4b3e1d8f96c9519b57694f8be96d10c8b0f1e5c269f74a91b38c295
generated_at: 2026-11-22T05:16:52.736267+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/controllers/get-preorder-levels.ts

## Purpose
Defines the HTTP controller for `GET /inventory/preorders`. It returns a page of the preorder board: each product's allowance, what is outstanding against it, and how that outstanding amount splits between paid and unpaid orders. The file is a thin declaration. It wires a query schema and a service call into a generic list-controller factory.

## Key elements
- `getPreorderLevels`: the exported controller, built with `createListController`. Its configuration is:
  - `entity: 'preorderLevels'`
  - `schema`: `ListPreorderLevelsQueryParams` (from `@api/schemas.zod`), extended with `page: pageSchema` and `pageSize: pageSizeSchema`, then made `.partial()` so every query param is optional.
  - `runList`: calls `inventoryService.listPreorders(parsed)` with the parsed query.

## Relationships
- `src/infrastructure/surfaces/create-list-controller.ts`: provides the `createListController` factory that turns the entity name, schema and `runList` callback into the actual handler.
- `src/infrastructure/http/schemas.ts`: supplies `pageSchema` and `pageSizeSchema`, which override the pagination fields in the generated query schema.
- `src/modules/inventory/services/index.ts`: exports `inventoryService`, whose `listPreorders` does the data retrieval.
- `src/modules/inventory/routes.ts`: the route file that mounts this controller on `/inventory/preorders`. This is inferred from the module's routing role. The controller file itself doesn't show the registration.

## Notes
- `.partial()` is applied after `.extend(...)`, so the generated filter params and the pagination params are all optional.
- Filtering and pagination semantics are defined elsewhere: in the generated `ListPreorderLevelsQueryParams`, in the shared page schemas and in `listPreorders`. This file adds no logic of its own.
