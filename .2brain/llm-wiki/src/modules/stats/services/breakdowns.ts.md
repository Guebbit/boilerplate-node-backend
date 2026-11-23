---
source: src/modules/stats/services/breakdowns.ts
source_sha256: 0ef03b34044db33c61f79387f0c467cdcf07ff8aeb54ae228f9ce918015fa42d
context_sha256: 8f7596f303d8eeb55db2d4cb56c1095f5aaeca9757a00ab76d3eebc61af589cc
generated_at: 2026-11-22T07:51:53.315179+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/services/breakdowns.ts

## Purpose
Builds the sales dashboard's tables and snapshots: products, categories, a single product over time, the payments mix, operations rates, customers, and the open pipeline. Each function does one owner-service read, or two merged by key, and shapes the result for the API types. Monetary values are converted to decimal strings at this layer.

## Key elements
- `getProductStats(period, limit)` – top products from `orderService.productTotals`, merged by `productId` with `returnService.returnedByProduct`. Yields `unitsOrdered`, `unitsReversed`, `netUnits` and `netSales`.
- `getCategoryStats(period)` – net sales and units per category and currency from `orderService.categoryTotals`.
- `getProductSeries(period, productId)` – one product's ordered and reversed units per bucket. It iterates `period.bucketStarts`, so every bucket is present and missing ones default to 0. `title` is included only when defined.
- `getPaymentMix(period)` – `paymentService.methodMix` rows by method, provider and currency, with payment count and amount.
- `getOperationsStats(period)` – four parallel reads that produce three rates:
  - cancellation: the order cohort, plus `rate`
  - returns: units ordered (from paid buckets) vs. units returned
  - refunds: per currency, credited gross vs. invoiced gross
- `getCustomerStats(period)` – customers, new customers, returning customers and the returning rate, from `orderService.customerCounts`.
- `getPipelineStats()` – the only function with no period. It reports `paidNotShipped` and `awaitingTransfers` per currency (count, amount, and optional `nearestPayBy` as an ISO string).

## Relationships
- Calls the `orders`, `returns`, `payments` and `invoicing` module services through their public `index.ts` entry points.
- `@domain-primitives/money` (`src/domain-primitives/money.ts`): `toDecimalString` formats amounts, and `addMoney` sums gross invoiced and credited values.
- `../domain/figures` (`src/modules/stats/domain/figures.ts`): `rateOf` computes every rate.
- `./range` (`src/modules/stats/services/range.ts`): provides the `Period` input (`window`, `echo`, `bucketStarts`) and the `WithoutLimits` response wrapper.
- `@types` (`src/types/index.ts`): the response shapes `ProductStats`, `CategoryStats`, `ProductSeries`, `PaymentMix`, `OperationsStats`, `CustomerStats` and `PipelineStats`.
- Presumably re-exported through `src/modules/stats/services/index.ts`.

## Notes
- Each period-based result echoes `period.echo` and is typed `WithoutLimits<...>`. `getPipelineStats` returns a plain `PipelineStats`.
- Series buckets are matched by `toISOString()` keys.
- Refund rows are grouped by the sorted set of currencies found in the invoicing money buckets.
