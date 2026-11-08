---
source: src/modules/stats/services/breakdowns.ts
sha256: 6d15399d9f75eab16c68fa199467012098025f8c40b6d33ce4843c5d6b36e38b
generated_at: 2026-11-08T08:25:19.583929+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/services/breakdowns.ts

## Purpose

Implements the sales-dashboard breakdown queries. Each exported function is a single "owner read" (or two reads merged by key) that pulls from domain services and shapes the result into the dashboard's response types. Together they cover products, categories, one-product-over-time, payment mix, operations rates, customers, and the live pipeline.

## Key elements

- **`getProductStats(period, limit)`** — Top-N products by net sales for the period, merged with per-product return counts from `returnService`. Returns `ProductStats`.
- **`getCategoryStats(period)`** — Net sales aggregated per category. Returns `CategoryStats`.
- **`getProductSeries(period, productId)`** — Unit counts for a single product across every bucket in the period (zero-filled for missing buckets), split into ordered vs. reversed. Returns `ProductSeries`.
- **`getPaymentMix(period)`** — Payment counts and amounts grouped by method and provider. Returns `PaymentMix`.
- **`getOperationsStats(period)`** — Three rates in one call: cancellation cohort rate, return rate, and refund rate (per currency). Fans out to four parallel service calls. Returns `OperationsStats`.
- **`getCustomerStats(period)`** — Total, new, and returning customer counts plus the returning rate. Returns `CustomerStats`.
- **`getPipelineStats()`** — Point-in-time snapshot of paid-not-shipped orders and outstanding transfer obligations. Takes **no** period argument. Returns `PipelineStats`.

## Relationships

- **`@modules/orders`** (`orderService`) — primary data source; called for product totals, category totals, product series, cancellation cohort, paid buckets, customer counts, and pipeline.
- **`@modules/returns`** (`returnService`) — supplies reversed-unit data (per product, per bucket, per product) merged into product stats and series.
- **`@modules/invoicing`** (`invoicingService`) — provides `moneyBuckets` for the refund-rate calculation in `getOperationsStats`.
- **`@modules/payments`** (`paymentService`) — provides `methodMix` for the payment-mix view.
- **`./figures`** — `rateOf(numerator, denominator)` used for every rate calculation.
- **`./range`** — `Period` and `WithoutLimits<T>` types shape all inputs/outputs.
- **`@domain-primitives/money`** — `addMoney` (aggregating multi-row money values) and `toDecimalString` (serializing Decimal → string) used throughout.
- **`@types`** — all response type interfaces (`ProductStats`, `CategoryStats`, `ProductSeries`, `PaymentMix`, `OperationsStats`, `CustomerStats`, `PipelineStats`).
- **`./index`** — barrel that re-exports this module for the stats service layer.

## Notes

- Every monetary field in a response is a **decimal string** (via `toDecimalString`), never a `Decimal` or number. The one exception is `addMoney` in `getOperationsStats`, where Decimals are summed first, then stringified.
- `getProductSeries` **guarantees** the bucket array length equals `period.bucketStarts.length`; missing data is filled with `0`.
- `getPipelineStats` is the only function with no `Period` parameter — it reflects current state, not a historical window.
- `getOperationsStats` is the heaviest fan-out (4 parallel awaits) and the only function that needs `addMoney` for cross-row aggregation.
- The `title` field on `ProductSeries` is conditionally included (`...(sold.title === undefined ? {} : { title })`) to keep the response shape optional.
