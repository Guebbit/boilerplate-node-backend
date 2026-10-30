---
source: src/modules/stats/services/breakdowns.ts
sha256: 145a9b2fc869eeb5564f359055764af8de1cedb168d3a7e538595ad5da057bd4
generated_at: 2026-10-29T05:55:51.244977+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/services/breakdowns.ts

## Purpose

Composes the sales dashboard's breakdown tables and snapshots. Each exported function orchestrates one or more domain-service reads (orders, returns, payments, invoicing), merges or aggregates the raw rows, and shapes the result into a typed dashboard response. This file contains no domain logic of its own — it is a read-only aggregation layer over the module services.

## Key elements

- **`getProductStats(period, limit)`** — Top-N products by sales, each annotated with `unitsReversed` and `netUnits`. Merges `orderService.productTotals` with `returnService.returnedByProduct` via a `Map` keyed on `productId`.
- **`getCategoryStats(period)`** — Net sales grouped by category. Single read from `orderService.categoryTotals`.
- **`getProductSeries(period, productId)`** — Per-bucket units for one product. Merges `orderService.productSeries` and `returnService.returnedSeries`, then re-indexes both into maps keyed by bucket ISO string so that `period.bucketStarts` guarantees every bucket appears (zeros filled in).
- **`getPaymentMix(period)`** — Payment counts and amounts by method + provider, from `paymentService.methodMix`.
- **`getOperationsStats(period)`** — Three rates in one call: cancellation (cohort), returns (units), refunds (money). Fans out to four parallel service calls (`cancellationCohort`, `paidBuckets`, `returnedBuckets`, `moneyBuckets`) and groups refunds by currency using `addMoney`.
- **`getCustomerStats(period)`** — Total, new, and returning customer counts plus the returning rate, from a single `orderService.customerCounts` call.
- **`getPipelineStats()`** — Current (period-less) snapshot of paid-but-unshipped orders and awaiting transfers. The only export that takes no `Period`.

All functions return `Promise<T>` where `T` is one of the `@types` stat interfaces. All monetary values pass through `toDecimalAmount` before being placed in the response.

## Relationships

- **`src/modules/orders/services/index.ts`** — Primary data source; every function except `getPaymentMix` and `getOperationsStats` (partially) calls `orderService` methods.
- **`src/modules/returns/services/index.ts`** — Provides `returnedByProduct`, `returnedSeries`, `returnedBuckets` for the "reversed" columns in product, series, and operations stats.
- **`src/modules/payments/services/index.ts`** — Sole source for `getPaymentMix` via `paymentService.methodMix`.
- **`src/modules/invoicing/services/index.ts`** — Supplies `moneyBuckets` for the refunds rate in `getOperationsStats`.
- **`src/domain-primitives/money.ts`** — `toDecimalAmount` (used on every monetary field) and `addMoney` (used to sum invoiced/credited gross per currency).
- **`src/modules/stats/services/figures.ts`** — `rateOf(numerator, denominator)` is the shared rate calculator for all three operation rates and the customer returning rate.
- **`src/modules/stats/services/range.ts`** — Provides the `Period` type (and its `window`/`echo`/`bucketStarts` fields) that every period-scoped function consumes.
- **`src/modules/stats/services/index.ts`** — Re-exports this module's functions to the rest of the stats service surface.
- **`src/types/index.ts`** — Defines the response interfaces (`ProductStats`, `CategoryStats`, etc.) that shape each return value.

## Notes

- **Zero-filling in `getProductSeries`:** The function iterates `period.bucketStarts` (not the service response) and looks up each bucket in a map, so buckets with no activity are explicitly present with `0`. This is the one place where the period's bucket list drives output shape rather than the service rows.
- **`getPipelineStats` is a live snapshot:** It takes no `Period` and returns "right now" data. Its `nearestPayBy` is conditionally included (omitted when absent) to keep the JSON lean.
- **Refunds are per-currency:** `getOperationsStats` splits the invoicing `moneyBuckets` rows by currency, sums each group with `addMoney`, and emits one object per currency. Currencies are sorted via `toSorted()` for deterministic ordering.
- **`toDecimalAmount` is applied at the boundary:** Raw service rows carry numeric amounts; this file converts them to the decimal/amount representation expected by the UI before returning. No arithmetic on amounts is done here except via `addMoney`.
