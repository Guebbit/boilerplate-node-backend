---
source: src/modules/delivery/controllers/get-preorder-fulfillment-orders.ts
sha256: 931e65440688b309dcfa666b9e5199236ea3eed36ede69701f0e6289866b1b19
generated_at: 2026-11-08T05:26:42.746573+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/get-preorder-fulfillment-orders.ts

## Purpose

Defines the two read-only controllers behind the preorder board: one returns a paginated list of fulfillment orders, the other returns per-product unit-count summaries. Both are thin adapters that parse/validate query params and delegate to the delivery service.

## Key elements

- **`getPreorderFulfillmentOrders`** — `createListController` instance for `GET /delivery/fulfillment-orders`. Accepts a partial of `ListPreorderFulfillmentOrdersQueryParams` plus `page`/`pageSize`. Coerces `late` (boolean) and `dueWithin` (number) from their string query-param representations before calling `deliveryService.listPreorderFulfillmentOrders`.
- **`getPreorderSummary`** — `createListController` instance for `GET /delivery/fulfillment-orders/summary`. Accepts a partial of `SummarizePreorderFulfillmentOrdersQueryParams` plus `page`/`pageSize`. Delegates to `deliveryService.summarizePreorders`.

## Relationships

- **`src/infrastructure/surfaces/create-list-controller.ts`** — Both controllers are built via the `createListController` factory, which handles request parsing, pagination, and response shaping.
- **`src/infrastructure/http/schemas.ts`** — Supplies `pageSchema` and `pageSizeSchema`, extended into each controller's Zod schema.
- **`src/modules/delivery/services/index.ts`** — Exposes `deliveryService`; the two `runList` callbacks call `listPreorderFulfillmentOrders` and `summarizePreorders` respectively, passing the parsed params and `request.authContext`.
- **`src/modules/delivery/routes.ts`** — Registers these two controllers on their respective GET paths.

## Notes

- `page` and `pageSize` are added to each schema via `.extend(...).partial()`, making them optional — the `createListController` factory presumably supplies defaults.
- The `input` coercion map (`booleans: ['late']`, `numbers: ['dueWithin']`) exists only on the first controller; the summary endpoint has no such typed query params.
- Both controllers pass `request.authContext` through to the service, so authorization context is resolved upstream (route layer) and forwarded here.
