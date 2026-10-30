---
source: src/modules/delivery/controllers/get-preorder-fulfillment-orders.ts
sha256: 931e65440688b309dcfa666b9e5199236ea3eed36ede69701f0e6289866b1b19
generated_at: 2026-10-29T03:31:38.758255+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/get-preorder-fulfillment-orders.ts

## Purpose

Defines the two read-only HTTP handlers for the preorder board: a paginated list of fulfillment orders and a per-product unit-count summary. Both are thin wrappers that delegate to `deliveryService` after validating and parsing query parameters.

## Key elements

- **`getPreorderFulfillmentOrders`** — Controller for `GET /delivery/fulfillment-orders`. Built via `createListController`; validates query params with `ListPreorderFulfillmentOrdersQueryParams` (+ pagination), coerces `late` (boolean) and `dueWithin` (number) from query-string text, then calls `deliveryService.listPreorderFulfillmentOrders`.
- **`getPreorderSummary`** — Controller for `GET /delivery/fulfillment-orders/summary`. Same factory pattern; validates with `SummarizePreorderFulfillmentOrdersQueryParams` (+ pagination) and calls `deliveryService.summarizePreorders`.

## Relationships

- **`src/infrastructure/surfaces/create-list-controller.ts`** — Supplies the `createListController` factory that both exports consume, handling request parsing, pagination plumbing, and response shaping.
- **`src/infrastructure/http/schemas.ts`** — Provides `pageSchema` and `pageSizeSchema`, extended into each controller's param schema.
- **`src/modules/delivery/services/index.ts`** — Exports `deliveryService`, whose `listPreorderFulfillmentOrders` and `summarizePreorders` methods perform the actual data access.
- **`src/modules/delivery/routes.ts`** — Registers these two exported controllers on their respective route paths.

## Notes

- Both controllers use `.partial()` on their param schema, meaning every query parameter is optional; the service layer is expected to handle defaults.
- The `input: { booleans: ['late'], numbers: ['dueWithin'] }` hint tells `createListController` to coerce those specific query-string values from `string` to the correct type before passing to `runList`.
