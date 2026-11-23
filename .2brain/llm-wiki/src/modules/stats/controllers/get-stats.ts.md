---
source: src/modules/stats/controllers/get-stats.ts
source_sha256: da1ba27e91f889336ebf3e036b8a88735c2ff1333494e1fb37fd40b49398c4b6
context_sha256: a03140d8be13832cd6da83d77e55d73557f183de6ee4bb83320d069dc1dea178
generated_at: 2026-11-22T07:50:06.709541+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/controllers/get-stats.ts

## Purpose
Defines the HTTP controllers for the stats read endpoints. Each is a thin wrapper that pairs a strict Zod query schema with a call into `statsService`, delegating the shared request/response handling to `statsHandler` in `./respond`. Every route takes a shop-local period except the pipeline, which is a snapshot of the current state.

## Key elements
- `getSalesStats`: `GET /stats/sales`. Query is the period fields plus `interval`. Calls `statsService.getSalesStats(period)`.
- `getProductStats`: `GET /stats/products`. Query is the period fields plus `limit`. `limit` is blank-to-undefined preprocessed, coerced to an integer from 1 to 100, and defaults to 10. Calls `statsService.getProductStats(period, limit)`.
- `productSeries` (internal): `statsHandler` for the per-product series. Query is the period fields plus `interval`. Reads `request.params.productId` and calls `statsService.getProductSeries(period, productId)`.
- `getProductSalesSeries`: `GET /stats/products/:productId`. A `namedHandler` that first runs `requireId` on `productId`, then runs `productSeries` if the id is valid.
- `getCategoryStats`: `GET /stats/categories`. Calls `statsService.getCategoryStats`.
- `getPaymentMixStats`: `GET /stats/payments`. Calls `statsService.getPaymentMix`.
- `getOperationsStats`: `GET /stats/operations`. Cancellation, return and refund rates. Calls `statsService.getOperationsStats`.
- `getCustomerStats`: `GET /stats/customers`. Calls `statsService.getCustomerStats`.
- `getPipelineStats`: `GET /stats/pipeline`. Hand-written handler with no period or query schema. It calls `statsService.getPipelineStats()`, sends the result with `successResponse`, and routes errors through `catchAs`.

## Relationships
- `./respond` supplies `statsHandler`, `periodFields` and `intervalField`. Every period-based controller is built from these.
- `../services` (`statsService`) is the data layer. Each controller maps to one service method.
- `@infrastructure/http/controller` supplies `namedHandler`, which wraps the product-series handler, and `catchAs`, which handles errors in the pipeline controller.
- `@infrastructure/http/ids` supplies `requireId`, which validates `productId`.
- `@infrastructure/http/response` supplies `successResponse`, used directly only by the pipeline controller.
- `@infrastructure/http/schemas` supplies `blankToUndefined`, used for the `limit` preprocessing.
- `../routes` is the consumer. It presumably binds these exports to the `/stats/*` paths named in the doc comments.

## Notes
- All period schemas use `z.strictObject`, so unknown query parameters are rejected.
- A malformed `productId` returns 404 with the key `stats.product-not-found`, not a validation error. The check runs before the query is parsed.
- `getProductSalesSeries` and `productSeries` share the handler name `'getProductSalesSeries'` for error reporting.
- `getPipelineStats` bypasses `statsHandler`, so it has no query validation.
