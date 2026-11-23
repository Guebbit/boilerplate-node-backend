---
source: src/modules/stock-alerts/openapi.yaml
generated_at: 2026-11-22T07:55:03.116740+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract (v0.1.0) for the `stock-alerts` module. It describes the endpoints that let an authenticated user ask to be notified once, by one mail and one inbox message, when a product they cannot currently order becomes orderable again. It also declares the module's error codes and its section of the account data export.

## Key elements
- **Tag `StockAlerts`** (`x-family: Catalogue`): groups all operations in this module.
- **`GET /stock-alerts`** (`listStockAlerts`): returns the caller's open requests, newest first. It is never paginated and never returns 404, because an empty list is the same as no requests. Responses: 200, 401.
- **`POST /stock-alerts`** (`createStockAlert`): records a request for the `productId` in the body.
  - It is idempotent. Asking again for the same product returns the same 200.
  - It always returns the whole list, as `StockAlertsResponse`.
  - Responses: 200, 401, 404 (product hidden or deleted), 409, 422 (missing or malformed `productId`).
- **`DELETE /stock-alerts/{productId}`** (`deleteStockAlert`): cancels the caller's own request and returns the remaining list. A request the caller does not hold gives 404, so a stale client knows. Responses: 200, 401, 404.
- **`x-error-codes`**:
  - `STOCK_ALERT_LIMIT_REACHED` (409): the account already holds `NODE_STOCK_ALERTS_MAX` requests (default 100). Re-asking for a product already waited for is never refused.
  - `STOCK_ALERT_PRODUCT_BUYABLE` (409): the product can be ordered now.
  - `createStockAlert` maps `409` to both codes through an operation-level `x-error-codes`.
- **`x-personal-data.stockAlerts`**: an array of `StockAlert`. This is the module's section of the `POST /account/export` response, which the bundler adds to `AccountExportResponse`.
- **Schemas**:
  - `CreateStockAlertRequest`: requires `productId`.
  - `StockAlert`: `productId` and `createdAt` (date-time).
  - `StockAlertsResponse`: `{ items: StockAlert[] }`.
  - All three are `additionalProperties: false`.

## Relationships
The file has no graph neighbors, so no dependency-graph interactions are recorded. Its only external references are `$ref` pointers by relative path into the shared contract `shared/contracts/openapi.root.yaml`, which is not a graph neighbor. These pointers cover:
- Responses: `Unauthorized`, `NotFound`, `Conflict`, `ValidationError`.
- Parameter: `ProductIdPathParam`.
- Schema: `Id`.

All operations use `bearerAuth`.

## Notes
- A request is single-use. It is deleted once answered, so answered requests never appear in the list.
- The description says a product counts as orderable again with shelf units, an open backorder, a preorder with allowance left, or back on sale.
- The `x-personal-data` section is tied to the module: the file's comment says removing the module removes the section.
- `NODE_STOCK_ALERTS_MAX` is the configurable cap (default 100). The contract only names it, and the file shows no implementation.
