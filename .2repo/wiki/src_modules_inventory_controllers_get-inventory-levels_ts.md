# src/modules/inventory/controllers/get-inventory-levels.ts

## Purpose

Thin HTTP controller for `GET /inventory/levels`. It validates and parses the query string (including pagination and a boolean filter), then delegates to the inventory service to return a paginated list of stock levels ordered scarcest-first.

## Key elements

- **`getInventoryLevels`** (default export) — Built with the `createListController` factory. Configures:
  - `entity: 'inventoryLevels'`
  - `schema` — `ListInventoryLevelsQueryParams` extended with `page`/`pageSize`, then made fully `.partial()`
  - `input.booleans: ['lowOnly']` — coerces the text-only query-param `lowOnly` into a real boolean before passing to the service
  - `runList` — calls `inventoryService.listLevels(parsed)`

## Relationships

- **`src/infrastructure/http/schemas.ts`** — supplies `pageSchema` and `pageSizeSchema` used in the pagination fields of the request schema.
- **`src/infrastructure/surfaces/create-list-controller.ts`** — provides the `createListController` factory that wraps routing, validation, boolean coercion, and response shaping into a single reusable controller.
- **`src/modules/inventory/service.ts`** — `inventoryService.listLevels` is the actual data-fetching call invoked after validation.
- **`src/modules/inventory/routes.ts`** — registers `getInventoryLevels` on the `GET /inventory/levels` route.

## Notes

- All schema fields are optional (`.partial()`), so the endpoint works with zero query params.
- `lowOnly` is declared in the `input.booleans` array rather than as a native Zod boolean because raw query-string values are always strings; `createListController` handles the coercion.
- The file is marked `@module` in its JSDoc but does have a named export; treat it as a single-purpose controller file.
