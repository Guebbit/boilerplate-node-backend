---
source: src/modules/shop-tasks/openapi.yaml
source_sha256: 85c319e95d8971dcdfbd815546a3a763bb84fb543a266c6d5f58b1b77df13f94
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T07:42:21.480741+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract (version `0.1.0`) for the `shop-tasks` module. It describes a single read-only endpoint that returns the counts of open work shown as badges in the staff navigation.

## Key elements
- **Tag `Shop`**: the tag this module's operations use (`x-family: Running the shop`).
- **`GET /shop-tasks/summary`** (`operationId: getShopWorkSummary`): returns one count per staff screen that has a badge. It requires `bearerAuth`. It responds `200` with `ShopWorkSummary`, or `401` through a shared `Unauthorized` response.
- **`ShopWorkSummary` schema**: an object with `additionalProperties: false`. Every property is an integer with `minimum: 0`, and each is optional.
  - `salesOrders`: orders with `fulfillmentStatus=awaiting_shipment`. Needs `display:Order`.
  - `salesPayments`: the rows listed by `GET /payments/attention`, all sources together, each capped at 100. Transfers still awaited are excluded. Needs `display:Payment`.
  - `returns`: returns with `status=requested`. Needs `read:Return`.
  - `salesPreorders`: preorder fulfillment orders with `late=true`. Needs `display:Order`.
  - `inventory`: stock levels with `lowOnly=true`. Needs `read:StockLevel`.

## Relationships
- None in the dependency graph: this file has no graph neighbors.
- The descriptions mention list endpoints and filters that the counts mirror, such as `GET /payments/attention`, the orders list with `fulfillmentStatus=awaiting_shipment`, the returns list with `status=requested`, and the stock list with `lowOnly=true`. Those endpoints are not defined in this file.

## Notes
- A count key is present only when the caller may open the matching screen. Zero is sent as `0` and is never omitted. A missing key therefore means "no access", not "nothing to do".
- Each count should equal the count of the corresponding screen's own list, so a badge and its screen agree.
- Counts are read as the calling person. API keys are not used, so each count reflects the caller's own jurisdiction.
- The response is never cached, because it is one person's view.
- The `401` response is a `$ref` to `Unauthorized` in a shared root contract file, outside this module.
