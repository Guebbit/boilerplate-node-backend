---
source: src/modules/stats/services/breakdowns.ts
sha256: 30d91336804c7bdd67412cf8d741b4399207d911caf11b9efdcf8e18745523eb
generated_at: 2026-10-15T12:03:55.643655+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/services/breakdowns.ts

## Purpose

Provides the read-only aggregation queries behind the sales dashboard: top products, category totals, a single product's time series, the payment-method mix, operations rates (cancellation / returns / refunds), customer breakdown, and the live open pipeline. Each exported function composes one or two underlying service calls into a fully shaped, serialisable response.

## Key elements

- **`getProductStats(period, limit)`** — Top-N products by units ordered, enriched with units returned per product. Merges `orderService.productTotals` with `returnService.returnedByProduct`.
- **`getCategoryStats(period)`** — Net sales grouped by category from `orderService.categoryTotals`.
- **`getProductSeries(period, productId)`** — Per-bucket units ordered and units reversed for one product. Iterates `period.bucketStarts` so every bucket is present (zero-filled where no data).
- **`getPaymentMix(period)`** — Payment counts and totals grouped by method + provider from `paymentService.methodMix`.
- **`getOperationsStats(period)`** — Three rates in one response: cancellation (cohort-based), return rate (units), and refund rate (money, per currency). Fans out four parallel service calls.
- **`getCustomerStats(period)`** — Total / new / returning customer counts and the returning rate from `orderService.customerCounts`.
- **`getPipelineStats()`** — Point-in-time snapshot of paid-but-unshipped orders and transfers awaiting payment. Takes **no** period argument.

## Relationships

- **`@modules/invoicing`** — `invoicingService.moneyBuckets` supplies invoiced/credited money rows used by `getOperationsStats`.
- **`@modules/orders`** — `orderService` is the primary data source (product totals, category totals, series, cohort, paid buckets, customer counts, pipeline).
- **`@modules/payments`** — `paymentService.methodMix` feeds `getPaymentMix`.
- **`@modules/returns`** — `returnService` supplies per-product and per-series return data merged into product stats and series.
- **`@shared-kernel/money`** — `toDecimalAmount` serialises money for the API response; `addMoney` sums multi-row money values in the refunds calculation.
- **`@types`** — All response shapes (`ProductStats`, `CategoryStats`, `ProductSeries`, `PaymentMix`, `OperationsStats`, `CustomerStats`, `PipelineStats`) are declared here.
- **`./figures`** — `rateOf` computes the ratio used for every rate field.
- **`./range`** — `Period` type and `period.bucketStarts` drive the time-window and bucket enumeration.
- **`./index`** — Barrel that re-exports these functions for consumers of the stats service.

## Notes

- **`getPipelineStats` is the only function that ignores `period`.** It returns a "right now" snapshot; do not pass a period to it.
- **Zero-filling in `getProductSeries`:** buckets with no orders *or* returns are still emitted with `unitsOrdered: 0` / `unitsReversed: 0`. Callers can rely on the array length matching `period.bucketStarts.length`.
- **Money handling:** Raw integer amounts from services are converted to decimal strings via `toDecimalAmount` at this layer. `addMoney` is only used when summing multiple rows (refunds); single-row amounts go straight through `toDecimalAmount`.
- **`period.echo`** is copied verbatim into every response object so the UI can display the resolved period without a round-trip.
- **Conditional spread in `getProductSeries`:** the `title` field is only included when the underlying service returned one (i.e. non-`undefined`), keeping the response shape consistent with the type definition.
