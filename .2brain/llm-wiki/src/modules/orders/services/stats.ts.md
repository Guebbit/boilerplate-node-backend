---
source: src/modules/orders/services/stats.ts
source_sha256: caf2f9326f3508344767493d0bb51b9a38f63c4fa5cd2f1e794714d048e05fce
context_sha256: 1a73c5e8b1a75ec70fc71aa7ca9b140ad17d0a672e6342e6a550ef8dc9b98853
generated_at: 2026-11-22T06:24:12.301405+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/stats.ts

## Purpose
Holds the grouped MongoDB aggregation reads that the `stats` composer merges by key. Each read returns at most a few hundred already-grouped rows: orders and units per bucket, top products, categories, customers, the cancellation cohort, and the open pipeline. Orders the shop has deleted (`deletedAt` set) are excluded from every count here. Their money stays in the totals, since the invoice stays.

## Key elements
- `paidBuckets(window)`: orders and units per currency and time bucket, dated by `paidAt`. Returns `PaidBucket[]`.
- `productTotals(window, limit)`: top products by net sales, from the frozen order lines, sorted by `netSales` with `productId` as tie-break. Returns `ProductTotal[]`.
- `categoryTotals(window)`: net sales and units per category, from the categories each line froze. Returns `CategoryTotal[]`.
- `productSeries(productId, window)`: units of one product per bucket, plus the title as the orders froze it. Returns `ProductSeriesRead`.
- `customerCounts(window)`: distinct accounts that paid in the window, and how many of those paid for the first time in it.
- `cancellationCohort(window)`: orders created in the window (by `createdAt`) and how many ended with status `canceled`.
- `pipeline()`: a snapshot via `$facet`. It returns bank transfers still pending per currency (count, amount, nearest `payBy`) and the number of paid orders awaiting shipment (`PipelineRead`).
- `paidIn(window)`: private `$match` stage for `paidAt` in `[from, to)` with `deletedAt: null`.
- `LINE_NET`: private expression for a line's net-of-VAT amount, `quantity × price ÷ (1 + taxRate)`, using the line's frozen rate.
- `ORDER_TOTAL`: private expression for an order's total, the sum of line quantity × price plus `$shippingCost` (VAT included).

## Relationships
- `src/modules/orders/repository.ts` (`orderRepository`): every function runs `.aggregate(...)` on it.
- `src/infrastructure/persistence/report.ts`: supplies the `ReportWindow` type and `bucketOf`, which builds the bucket expression for `$paidAt`.
- `src/infrastructure/persistence/create-repository.ts`: `toObjectId` converts `productId` for the `productSeries` match.
- `src/domain-primitives/money.ts`: `toMinorUnits` converts decimal aggregation results into `Money`, per currency. `Money` types the net-sales and amount fields.
- `src/modules/orders/domain/fulfillment.ts`: `fulfillmentStatusFilter('awaiting_shipment')` defines the "paid, not shipped" count in `pipeline`.
- `src/modules/orders/services/index.ts`: the services barrel. The file does not import it. Its doc comment says the `stats` composer consumes these reads.

## Notes
- Windows are half-open (`from` inclusive, `to` exclusive).
- `categoryTotals` counts a product in every category it has, so the rows do not sum to the total.
- `customerCounts` keys on `userId` and skips orders with a null `userId`, never on email, because erased accounts share one placeholder address. It matches all paid orders up to `to` so each account's first paid order can be found.
- `cancellationCohort` uses `createdAt`, not a cancel date, because there is no cancel date to bucket by.
- Net-of-VAT amounts are computed with `$toDecimal`, since prices include VAT. Per the file's comment, this mirrors `src/modules/orders/domain/tax.ts`.
- `productSeries` matches on the product twice, before and after `$unwind`. The first match narrows the orders. The second keeps only that product's lines.
