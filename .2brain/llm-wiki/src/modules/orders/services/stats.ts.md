---
source: src/modules/orders/services/stats.ts
sha256: caf2f9326f3508344767493d0bb51b9a38f63c4fa5cd2f1e794714d048e05fce
generated_at: 2026-11-14T20:46:41.443865+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/stats.ts

## Purpose

Read-only aggregate statistics for the orders module. Each exported function returns a small, pre-grouped result (a few hundred rows at most) that a dashboard or report composer can merge by key. All queries hit `orderRepository.aggregate` and filter out soft-deleted orders; monetary results are expressed net-of-VAT using each line's frozen tax rate.

## Key elements

- **`paidIn(window)`** – Internal `$match` helper: live orders whose `paidAt` falls in the half-open `[from, to)` window.
- **`LINE_NET`** – Reusable Mongo aggregation expression computing a line's net-of-VAT amount: `quantity × price ÷ (1 + taxRate)`.
- **`ORDER_TOTAL`** – Aggregation expression for a whole order's gross total (all lines' `quantity × price` plus `$shippingCost`, VAT included).
- **`paidBuckets(window)`** → `PaidBucket[]` – Order count and unit count per currency and time bucket.
- **`productTotals(window, limit)`** → `ProductTotal[]` – Top-N products by net sales, with units and net `Money`.
- **`categoryTotals(window)`** → `CategoryTotal[]` – Net sales and units per product category.
- **`productSeries(productId, window)`** → `ProductSeriesRead` – Per-bucket unit sales for a single product, plus the frozen title.
- **`customerCounts(window)`** – Distinct paying accounts in the window and how many paid for the first time in it.
- **`cancellationCohort(window)`** – Orders *placed* (`createdAt`) in the window and how many ended `canceled`.
- **`pipeline()`** → `PipelineRead` – Snapshot of bank-transfer orders still `pending` (count, total amount, nearest `payBy`) and paid orders awaiting shipment.
- **Interfaces** – `PaidBucket`, `ProductTotal`, `CategoryTotal`, `ProductSeriesRead`, `AwaitingTransfers`, `PipelineRead` define the return shapes.

## Relationships

- **`@infrastructure/persistence/report`** – Supplies `ReportWindow` (the `{ from, to, bucketSize }` parameter) and `bucketOf`, which computes the bucket key used in every `$group`.
- **`@domain-primitives/money`** – Provides `toMinorUnits` (converts the Mongo decimal result into the domain `Money` type) and the `Money` type itself.
- **`@infrastructure/persistence/create-repository`** – Supplies `toObjectId` to cast string product IDs into Mongo ObjectIds for matching.
- **`../domain/fulfillment`** – `fulfillmentStatusFilter('awaiting_shipment')` builds the status match used in the `pipeline` read.
- **`../repository`** – This file imports `orderRepository` from that module and calls `.aggregate()` on it; every function in this file is a thin pipeline over that single data-access entry point.
- **`../services/index`** – Re-exports this module so consumers import from the services barrel.

## Notes

- **Category totals ≠ product totals.** A product tagged with multiple categories is counted once per category after `$unwind`, so the sum of category rows can exceed the grand total.
- **Customer identity is `userId`, not email.** Erased accounts share a placeholder email; the aggregation groups by `userId` to keep them distinct.
- **`customerCounts` scans full history.** It matches all orders up to `to` (not just the window) so it can find each account's *first* paid order, then filters to accounts whose *last* paid order falls in the window.
- **Two different date fields.** Sale-based reads (`paidBuckets`, `productTotals`, etc.) filter on `paidAt`; the cancellation cohort filters on `createdAt` because there is no cancel timestamp to bucket by.
- **Deleted orders are excluded from counts** but their monetary value persists (the invoice is kept); the `deletedAt: null` filter enforces this.
