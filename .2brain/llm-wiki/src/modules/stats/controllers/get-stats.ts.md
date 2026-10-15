---
source: src/modules/stats/controllers/get-stats.ts
sha256: 55afef04292c4a8f1a87bb17e1ab1fbd5430a04746cc2373e1bafea59f2f6c3f
generated_at: 2026-10-15T12:02:39.264571+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/controllers/get-stats.ts

## Purpose

Thin, read-only HTTP controllers for the stats endpoints. Each export is a one-line (or near-one-line) handler that validates its query/params with a Zod schema, then delegates to the corresponding `statsService` method. The file exists so that `routes.ts` can map URL paths to handlers without containing any business logic or shared wiring.

## Key elements

- **`getSalesStats`** – `GET /stats/sales`. Validates period + interval; calls `statsService.getSalesStats`.
- **`getProductStats`** – `GET /stats/products`. Validates period + optional `limit` (int 1–100, default 10); calls `statsService.getProductStats`.
- **`productSeries`** *(internal, not exported)* – Core series handler that reads `request.params.productId`; calls `statsService.getProductSeries`.
- **`getProductSalesSeries`** – `GET /stats/products/:productId`. Wraps `productSeries` with a `requireId` guard: a malformed id is treated as "not found" (404) rather than 400.
- **`getCategoryStats`** – `GET /stats/categories`. Period only; calls `statsService.getCategoryStats`.
- **`getPaymentMixStats`** – `GET /stats/payments`. Period only; calls `statsService.getPaymentMix`.
- **`getOperationsStats`** – `GET /stats/operations`. Period only; calls `statsService.getOperationsStats`.
- **`getCustomerStats`** – `GET /stats/customers`. Period only; calls `statsService.getCustomerStats`.
- **`getPipelineStats`** – `GET /stats/pipeline`. No period (snapshot of current state). Manually wires `statsService.getPipelineStats` → `successResponse` / `catchAs` without the `statsHandler` wrapper.

## Relationships

- **`src/modules/stats/controllers/respond.ts`** – Provides `statsHandler` (shared validation → call → respond pipeline), `periodFields`, and `intervalField` used by every handler except `getPipelineStats`.
- **`src/modules/stats/services/index.ts`** – Exports `statsService`; the actual data-access calls all go through it.
- **`src/modules/stats/routes.ts`** – Consumes the named exports of this file and binds them to Express routes.
- **`src/infrastructure/http/controller.ts`** – Source of `catchAs` and `namedHandler` used for error mapping and handler naming.
- **`src/infrastructure/http/response.ts`** – Source of `successResponse`, used by `getPipelineStats`.
- **`src/infrastructure/http/ids.ts`** – Source of `requireId`, used by `getProductSalesSeries` to validate the `productId` path param.
- **`src/infrastructure/http/schemas.ts`** – Source of `blankToUndefined`, used to normalise the `limit` query param.

## Notes

- All schemas use `z.strictObject`, so unknown query keys are rejected rather than silently ignored.
- `getPipelineStats` is the sole exception to the `statsHandler` pattern: it takes no period, so it is written as a plain handler with explicit `.then` / `.catch`.
- `getProductSalesSeries` intentionally maps a malformed id to **404** (key `stats.product-not-found`) instead of 400, to avoid distinguishing "bad format" from "doesn't exist" to clients.
- The `limit` field on `getProductStats` goes through `z.preprocess(blankToUndefined, …)` so an empty query string (`?limit=`) falls back to the default of 10 rather than failing coercion.
