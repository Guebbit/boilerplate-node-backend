---
source: src/modules/delivery/controllers/get-preorder-fulfillment-orders.ts
sha256: 1e293d54f9af9b20f2338824a00b24e4f81d30b14f6a7ea335cc9710e5836d8a
generated_at: 2026-10-15T10:26:36.418333+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/get-preorder-fulfillment-orders.ts

## Purpose

Defines the two read controllers for the preorder board: a paginated list of fulfillment orders and a per-product unit-count summary. It wires query-string validation to the corresponding service calls so that `GET /delivery/fulfillment-orders` and `GET /delivery/fulfillment-orders/summary` can be registered on the delivery router.

## Key elements

- **`getPreorderFulfillmentOrders`** — `createListController` instance for the full list endpoint. Extends `ListPreorderFulfillmentOrdersQueryParams` with optional `page`/`pageSize`, coerces `preorder` and `late` booleans and the `dueWithin` number from query-string text, and delegates to `listPreorderFulfillmentOrders`.
- **`getPreorderSummary`** — `createListController` instance for the summary endpoint. Extends `SummarizePreorderFulfillmentOrdersQueryParams` with optional pagination and delegates to `summarizePreorders`.

## Relationships

- **`src/infrastructure/http/schemas.ts`** — Supplies `pageSchema` and `pageSizeSchema`, which are `.extend`-ed onto each Zod parameter schema to allow optional pagination.
- **`src/infrastructure/surfaces/create-list-controller.ts`** — The factory that wraps the two controllers: handles request parsing, auth context extraction, and response shaping so the file only declares *what* to run, not *how* to serve it.
- **`src/modules/delivery/routes.ts`** — Registers `getPreorderFulfillmentOrders` and `getPreorderSummary` to their respective `GET` paths.
- **`src/modules/delivery/services/index.ts`** — Re-exports `listPreorderFulfillmentOrders` and `summarizePreorders`, which are the two functions invoked by the controllers' `runList` callbacks.
- **`src/modules/delivery/services/board.ts`** — Implements those two service functions; the actual query logic lives here, not in this controller file.

## Notes

- Both schemas are made `.partial()`, meaning *every* filter field (including pagination) is optional at the route level. The service layer is expected to supply defaults.
- The `input` coercion config (`booleans`, `numbers`) is only present on the first controller. The summary controller has no such fields, so no coercion is needed there.
- Because `createListController` is a shared factory, adding a new list endpoint in this module means adding another exported const with the same shape—no separate boilerplate per endpoint.
