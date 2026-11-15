---
source: src/modules/stats/services/breakdowns.ts
sha256: 0ef03b34044db33c61f79387f0c467cdcf07ff8aeb54ae228f9ce918015fa42d
generated_at: 2026-11-14T22:02:08.567629+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/services/breakdowns.ts

## Purpose

Provides the read-model aggregation layer for the sales dashboard. Each exported function orchestrates one or more domain-service calls (orders, payments, returns, invoicing), merges the results by a natural key (product, category, bucket, currency), and returns a shaped object matching a `@types` stats interface.

## Key elements

- **`getProductStats(period, limit)`** — Top-N products by units sold; joins `orderService.productTotals` with `returnService.returnedByProduct` to compute `netUnits`.
- **`getCategoryStats(period)`** — Net sales grouped by category (single call to `orderService.categoryTotals`).
- **`getProductSeries(period, productId)`** — Per-bucket units ordered vs. returned for one product; iterates `period.bucketStarts` so every bucket appears (gaps filled with 0).
- **`getPaymentMix(period)`** — Payment counts and totals grouped by method + provider (single call to `paymentService.methodMix`).
- **`getOperationsStats(period)`** — Three rates in one response: cancellation (cohort-based), returns (bucket sums), refunds (grouped by currency via `invoicingService.moneyBuckets`). Most complex function — 4 parallel service calls.
- **`getCustomerStats(period)`** — Total / new / returning customer counts and the returning rate.
- **`getPipelineStats()`** — Point-in-time snapshot (no period argument): paid-not-shipped count and transfers awaiting, with optional `nearestPayBy`.

## Relationships

- **`@modules/orders` (orderService)** — Primary data source; used by every function except `getPaymentMix`.
- **`@modules/returns` (returnService)** — Provides returned-unit data for product stats, product series, and operations stats.
- **`@modules/payments` (paymentService)** — Sole consumer in `getPaymentMix` (`methodMix`).
- **`@modules/invoicing` (invoicingService)** — Used only in `getOperationsStats` for `moneyBuckets` (invoiced vs. credited gross).
- **`@domain-primitives/money`** — `toDecimalString` formats all monetary values to strings; `addMoney` aggregates gross amounts in `getOperationsStats`.
- **`../domain/figures` (`rateOf`)** — Computes the ratio `part / whole` used for cancellation, returns, refunds, and customer rates.
- **`./range`** — Imports `Period` (the resolved time window + bucket starts) and the `WithoutLimits<T>` generic used in return types.
- **`@types`** — All return-shape interfaces (`ProductStats`, `CategoryStats`, etc.) are defined here.

## Notes

- **Gap-filling in `getProductSeries`:** The output bucket array is driven by `period.bucketStarts`, not by the service rows. Buckets with no data are emitted with `0` on both sides.
- **`getPipelineStats` has no period:** It is a live "right now" snapshot, not a historical query. It also returns `PipelineStats` (not wrapped in `WithoutLimits`), unlike every other function.
- **Currency handling in `getOperationsStats` refunds:** Rows are grouped by the currency set derived from `moneyBuckets`; amounts within a group are summed via `addMoney` (spread into the variadic), then rendered with `toDecimalString`.
- **`nearestPayBy` is optional:** In `getPipelineStats` it is conditionally spread — omitted from the object entirely when the service returns `undefined`.
- **`WithoutLimits<T>`** is a type-level utility from `./range` that strips a `limit` property from `T`; it signals to callers that the response carries no pagination metadata.
