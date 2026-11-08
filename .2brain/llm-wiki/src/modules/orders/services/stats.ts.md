---
source: src/modules/orders/services/stats.ts
sha256: 13ab95160c62395afa80ca908d75ed81a4f6b10cfd2c1b5096383c0f5fd2bb91
generated_at: 2026-11-08T07:01:21.095067+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/stats.ts

## Purpose

Read-only reporting queries for the orders domain. Each exported function runs a single MongoDB aggregation against the order collection (via `orderRepository`) and returns pre-grouped, small result sets (a few hundred rows at most). The file exists so that dashboard and API endpoints can compose order statistics—sales by bucket, top products, category totals, customer cohorts, cancellation rates, and the open pipeline—without writing raw aggregation pipelines at the call site.

## Key elements

- **`paidIn(window)`** — internal helper; builds the `$match` stage for live (`deletedAt: null`) orders paid within a `ReportWindow`.
- **`LINE_NET`** — internal aggregation expression: quantity × price ÷ (1 + taxRate), yielding a net-of-VAT decimal per order line.
- **`ORDER_TOTAL`** — internal aggregation expression: sum of all line quantities × price plus shipping, VAT included.
- **`paidBuckets(window)`** — orders and units paid, grouped by currency and time bucket. Returns `PaidBucket[]`.
- **`productTotals(window, limit)`** — top-N products by net sales (net-of-VAT), with units. Returns `ProductTotal[]`.
- **`categoryTotals(window)`** — net sales and units per category. A product in multiple categories appears in each. Returns `CategoryTotal[]`.
- **`productSeries(productId, window)`** — units of one product per bucket, plus the title as frozen on the order lines. Returns `ProductSeriesRead`.
- **`customerCounts(window)`** — distinct paying accounts in the window and how many paid for the first time in it. Keyed on `userId`, never email.
- **`cancellationCohort(window)`** — orders placed in the window and how many ended `canceled`. Dated by `createdAt` (no cancel-date field exists).
- **`pipeline()`** — snapshot of open work: bank-transfer orders awaiting payment (count, total, nearest `payBy`) and paid/processing orders not yet handed to a carrier. Returns `PipelineRead`.
- **Exported types** — `PaidBucket`, `ProductTotal`, `CategoryTotal`, `ProductSeriesRead`, `AwaitingTransfers`, `PipelineRead`.

## Relationships

- **`src/modules/orders/repository.ts`** — All functions call `orderRepository.aggregate(...)`. This file is the sole consumer of the repository in the stats path.
- **`src/domain-primitives/money.ts`** — Imports `toMinorUnits` to convert raw decimal sums into the `Money` value object, and the `Money` type for return signatures.
- **`src/infrastructure/persistence/report.ts`** — Imports `ReportWindow` (the half-open `{ from, to, bucketSize }` shape) and `bucketOf` (the `$group` key expression for time bucketing).
- **`src/infrastructure/persistence/create-repository.ts`** — Imports `toObjectId` for the single-product `productSeries` query.
- **`src/modules/orders/services/index.ts`** — Re-exports this module's public API so consumers can import stats from the service barrel.

## Notes

- **Deleted orders are excluded** from every count (`deletedAt: null`), but their monetary values remain in the database because the invoice persists.
- **`categoryTotals` rows do not sum to the product total.** A product assigned to multiple categories is counted once per category after the double `$unwind`.
- **`customerCounts` keys on `userId`, not email**, because erased accounts share a placeholder address.
- **`cancellationCohort` is a placed-date cohort**, not a cancel-date cohort—there is no `canceledAt` field to bucket by.
- **`pipeline` uses `$facet`** to run two independent sub-pipelines (transfers + paid-not-shipped) in a single round-trip.
- **Net-of-VAT math is duplicated from `orders/domain/tax.ts`** in the `LINE_NET` expression; keep the two in sync if the tax model changes.
