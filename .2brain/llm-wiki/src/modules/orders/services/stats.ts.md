---
source: src/modules/orders/services/stats.ts
sha256: 2f3aef1c6daad7de6cc3e9890b9a06f9c44fbbccd86983553f2989fb26b0a8f5
generated_at: 2026-10-29T04:50:04.380124+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/stats.ts

## Purpose

Read-only aggregation queries that produce order statistics for reporting dashboards. Each function returns a small, pre-grouped result set (a few hundred rows at most) covering paid volume per bucket, top products, category totals, product time series, customer acquisition, cancellation cohorts, and the open payment pipeline. The file exists so that report rendering never touches raw order documents directly.

## Key elements

- **`paidBuckets(window)`** – Order count and unit count grouped by currency and time bucket within a half-open window.
- **`productTotals(window, limit)`** – Top-N products by net-of-VAT sales (quantity × price ÷ (1+taxRate)), sorted descending, returns `Money` in minor units.
- **`categoryTotals(window)`** – Same net-sales computation grouped by category. A product in multiple categories appears in each row, so rows intentionally do not sum to the product total.
- **`productSeries(productId, window)`** – Per-bucket unit counts for one product, plus the title as frozen on the order.
- **`customerCounts(window)`** – Distinct `userId` values with ≥1 paid order in the window, and how many of those had their *first* paid order in the window. Uses `userId`, never email.
- **`cancellationCohort(window)`** – Orders created in the window and how many ended with `status: 'cancelled'`. Uses `createdAt` (not `paidAt`) because there is no cancel date to bucket by.
- **`pipeline()`** – Snapshot of the open pipeline: pending bank-transfer orders grouped by currency (count, total amount, nearest `payBy`) and the count of paid/processing orders not yet shipped.
- **`paidIn`** (internal) – Builds the `$match` stage: `paidAt` in window, `deletedAt: null`.
- **`LINE_NET`** (internal) – Aggregation expression for one line's net-of-VAT amount (price ÷ (1+taxRate) × quantity).
- **`ORDER_TOTAL`** (internal) – Aggregation expression for an order's gross total (all lines + shipping, VAT included).

## Relationships

- **`src/domain-primitives/money.ts`** – Imports `toMinorUnits` and the `Money` type to convert raw decimal aggregates into the canonical minor-unit representation.
- **`src/infrastructure/persistence/report.ts`** – Imports `bucketOf` (time-bucketing helper) and the `ReportWindow` type that parameterises every time-bounded query.
- **`src/infrastructure/persistence/create-repository.ts`** – Imports `toObjectId` for casting string product/user IDs to MongoDB ObjectIds inside match stages.
- **`src/modules/orders/repository.ts`** – Imports `orderRepository`; every function in this file runs its aggregation through that repository's `.aggregate()` method.
- **`src/modules/orders/services/index.ts`** – Re-exports the public functions and interfaces from this module so consumers import from the barrel.

## Notes

- **Deleted orders are excluded** from every count and series via `deletedAt: null`, but their monetary amounts are *not* deducted from historical invoices (the module docblock states "their money stays, since the invoice stays").
- **Category double-counting is intentional**: a product tagged with two categories contributes its full unit count and net sales to *both* rows. Callers must not sum category rows and expect the product total.
- **`customerCounts` looks back beyond `from`** to find each account's true first paid order, then filters by `last >= from`. The match on `paidAt.$lt: to` is the only upper bound.
- **`productSeries` matches the product ID twice** (pre- and post-`$unwind`) so that only orders containing that product are counted; the post-unwind match is the effective filter.
- **`pipeline()` uses `$facet`** to compute two independent sub-pipelines (transfers + paid-not-shipped) in a single round-trip.
- Money values in aggregation results are raw `Decimal128`; `toMinorUnits` is applied in the `.then()` mapping, never inside the pipeline.
