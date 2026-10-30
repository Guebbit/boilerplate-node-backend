---
source: src/modules/stats/controllers/get-stats.ts
sha256: 940f127eb9761264555790633c4f79b7fed5fedf5f99b8bc6cc3672811db8484
generated_at: 2026-10-29T05:54:47.847940+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/controllers/get-stats.ts

## Purpose

Thin read controllers for the stats module. Each exported handler maps a `GET /stats/*` route to a `statsService` method, with Zod-based query validation. All period-based reads share the `statsHandler` wrapper from `./respond`; the pipeline (snapshot) and limits (static constants) handlers are written manually.

## Key elements

- **`getSalesStats`** — `GET /stats/sales`. Validates `periodFields` + `interval`, calls `statsService.getSalesStats(period)`.
- **`getProductStats`** — `GET /stats/products`. Validates `periodFields` + optional `limit` (1–100, default 10; empty string coerced to `undefined`).
- **`getProductSalesSeries`** — `GET /stats/products/:productId`. Gates on `requireId` (404 for malformed id), then delegates to the private `productSeries` handler.
- **`productSeries`** *(not exported)* — the actual series read; pulls `productId` from `request.params`.
- **`getCategoryStats`** — `GET /stats/categories`. Period-only query.
- **`getPaymentMixStats`** — `GET /stats/payments`. Period-only query.
- **`getOperationsStats`** — `GET /stats/operations`. Period-only query.
- **`getCustomerStats`** — `GET /stats/customers`. Period-only query.
- **`getPipelineStats`** — `GET /stats/pipeline`. No period; a point-in-time snapshot. Hand-wired with `successResponse` / `catchAs` rather than `statsHandler`.
- **`getStatsLimits`** — `GET /stats/limits`. Returns `{ maxRangeDays, maxBuckets }` pulled from the domain module so client forms can validate against the same ceilings.

## Relationships

- **`src/modules/stats/controllers/respond.ts`** — provides `statsHandler`, `periodFields`, and `intervalField`; the shared composition used by every period-based handler in this file.
- **`src/modules/stats/services/index.ts`** — `statsService` is the single data-access dependency; every handler delegates to one of its methods.
- **`src/modules/stats/domain/index.ts`** — exports `MAX_BUCKETS` and `MAX_RANGE_DAYS`, surfaced verbatim by `getStatsLimits`.
- **`src/infrastructure/http/controller.ts`** — `namedHandler` (error-catching wrapper) and `catchAs` (promise-catch helper) underpin both the `statsHandler` path and the manual `getPipelineStats` handler.
- **`src/infrastructure/http/ids.ts`** — `requireId` validates the `productId` path param; a malformed id short-circuits to 404 before `productSeries` runs.
- **`src/infrastructure/http/schemas.ts`** — `blankToUndefined` preprocesses the `limit` query param so an empty string is treated as "absent."
- **`src/infrastructure/http/response.ts`** — `successResponse` serialises the 200 payload in the manual handlers.
- **`src/types/index.ts`** — `StatsLimits` type annotation on the limits response.
- **`src/modules/stats/routes.ts`** — registers these exported handlers on the stats router (consumer side).

## Notes

- `getPipelineStats` and `getStatsLimits` intentionally bypass `statsHandler` because they take no query period. Don't "refactor" them into the shared wrapper without accounting for that.
- `productSeries` is kept private on purpose: `getProductSalesSeries` is the only exported entry point and enforces the id check before the service call.
- The `limit` field uses `z.preprocess(blankToUndefined, …)` so a client sending `?limit=` (empty) gets the default of 10 rather than a validation error.
