---
source: src/modules/delivery/controllers/get-preorder-fulfillment-orders.ts
source_sha256: 931e65440688b309dcfa666b9e5199236ea3eed36ede69701f0e6289866b1b19
context_sha256: 8b5704053395416a15cfee8030c1c44c78c5ee659c98130ddcaf629dbdac780a
generated_at: 2026-11-22T04:45:51.236291+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/controllers/get-preorder-fulfillment-orders.ts

## Purpose
Defines the two HTTP controllers behind the preorder board's reads: `GET /delivery/fulfillment-orders` (one row per fulfillment order) and `GET /delivery/fulfillment-orders/summary` (per-product unit counts). Both are thin wrappers built with the shared list-controller factory that delegate to the delivery service.

## Key elements
- `getPreorderFulfillmentOrders` – list controller for `GET /delivery/fulfillment-orders`.
  - Entity name: `preorderFulfillmentOrders`.
  - Query schema: `ListPreorderFulfillmentOrdersQueryParams` extended with `page`/`pageSize`, then made `.partial()`.
  - Input coercion: `late` is parsed as a boolean and `dueWithin` as a number, because query strings carry them as text.
  - Runs `deliveryService.listPreorderFulfillmentOrders(parsed, request.authContext)`.
- `getPreorderSummary` – list controller for `GET /delivery/fulfillment-orders/summary`.
  - Entity name: `preorderSummary`.
  - Query schema: `SummarizePreorderFulfillmentOrdersQueryParams` extended with `page`/`pageSize`, then made `.partial()`.
  - Runs `deliveryService.summarizePreorders(parsed, request.authContext)`.

## Relationships
- `src/infrastructure/http/schemas.ts` – supplies `pageSchema` and `pageSizeSchema`, which override the generated schemas' pagination fields.
- `src/infrastructure/surfaces/create-list-controller.ts` – supplies `createListController`, which builds both controllers from `entity`, `schema`, optional `input` coercion and `runList`.
- `src/modules/delivery/services/index.ts` – supplies `deliveryService`, called by both `runList` callbacks along with the request's `authContext`.
- `src/modules/delivery/routes.ts` – the routes file for this module; presumably where these controllers are mounted at the paths above. The controller file itself doesn't register routes.

## Notes
- Because of `.partial()`, all query parameters, including the pagination ones, are optional.
- Only the list endpoint declares `input` coercion. The summary controller has none, so its query params are used as parsed by its schema.
- The query-param Zod schemas themselves are imported from `@api/schemas.zod`.
