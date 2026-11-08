---
source: src/modules/stats/controllers/get-stats.ts
sha256: 060fd99f4ef763960636a768da31b4d5e8aeb47e7cda2fa3375f5116b946183d
generated_at: 2026-11-08T08:23:44.292500+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/controllers/get-stats.ts

## Purpose
Read-only (GET) controllers for the stats module. Each exported handler validates query parameters with a zod schema, delegates to `statsService`, and writes the response. It is the thin controller layer between `routes.ts` and the stats service; all shared validation/handler logic lives in `./respond`.

## Key elements

- **`getSalesStats`** — `GET /stats/sales`. Period + interval query → `statsService.getSalesStats`.
- **`getProductStats`** — `GET /stats/products`. Period + optional `limit` (1–100, default 10) → `statsService.getProductStats`.
- **`productSeries`** *(internal, not exported)* — Core series handler; reads `request.params.productId` and calls `statsService.getProductSeries`.
- **`getProductSalesSeries`** — `GET /stats/products/:productId`. Wraps `productSeries` with `requireId`; a malformed id is treated as 404 (`stats.product-not-found`).
- **`getCategoryStats`** — `GET /stats/categories`. Period only.
- **`getPaymentMixStats`** — `GET /stats/payments`. Period only.
- **`getOperationsStats`** — `GET /stats/operations`. Period only.
- **`getCustomerStats`** — `GET /stats/customers`. Period only.
- **`getPipelineStats`** — `GET /stats/pipeline`. No period or query; a point-in-time snapshot. The only handler that bypasses `statsHandler` and writes the response directly.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `namedHandler` and `catchAs`, the generic Express handler wrappers used here.
- **`src/infrastructure/http/ids.ts`** — Supplies `requireId`, used by `getProductSalesSeries` to validate the path parameter before delegating.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, used by `getPipelineStats`.
- **`src/infrastructure/http/schemas.ts`** — Supplies `blankToUndefined`, a zod preprocessor for empty-string query values.
- **`src/modules/stats/controllers/respond.ts`** — Supplies `statsHandler` (the shared validate-then-call-then-respond factory) and the reusable field schemas `periodFields` / `intervalField`.
- **`src/modules/stats/routes.ts`** — Imports every exported handler from this file and attaches them to Express routes.
- **`src/modules/stats/services/index.ts`** — Provides `statsService`, the domain layer every handler delegates to.

## Notes

- All handlers except `getPipelineStats` are one-liner calls to `statsHandler(name, schema, fn)` from `./respond`; keep new reads in that same shape.
- `z.strictObject` is used throughout, so unknown query parameters are rejected (400) rather than silently ignored.
- `productSeries` is deliberately non-exported so that every external entry point to the series read goes through the id-validation wrapper.
- The file's module docstring states the convention: every route takes a shop-local period *except* the pipeline endpoint (a "right now" snapshot).
