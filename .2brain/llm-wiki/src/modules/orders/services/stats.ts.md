---
source: src/modules/orders/services/stats.ts
sha256: 327c9ef42f06e223acd0a4dbac9ebf983ea552a56933ebd112dbc8bd3f16c2bc
generated_at: 2026-10-15T11:11:29.750387+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/stats.ts

## Purpose

Composes read-only MongoDB aggregation queries that answer reporting questions over the orders collection: orders/units per time bucket, top products by net sales, category totals, per-product series, customer and new-customer counts, cancellation cohorts, and the current open pipeline. Each query returns a few hundred rows at most, already grouped server-side, so no further joining is needed by callers.

## Key elements

- **`paidIn`** (internal) — builds the `$match` stage used by every time-windowed query: `paidAt` in the half-open window, `deletedAt: null`.
- **`LINE_NET`** (internal) — reusable aggregation expression: `quantity × price ÷ (1 + taxRate)`, stripping VAT per the frozen line's rate.
- **`paidBuckets`** → `PaidBucket[]` — order count and unit count per currency + bucket.
- **`productTotals`** → `ProductTotal[]` — top-N products by net-of-VAT sales (unwinds `items`, groups by product, sorts, limits).
- **`categoryTotals`** → `CategoryTotal[]` — net sales per category (unwinds `items.product.categories`; a multi-category product appears in each).
- **`productSeries`** → `ProductSeriesRead` — units of a single product per bucket, plus the frozen title.
- **`customerCounts`** → `{ customers, newCustomers }` — distinct accounts that paid in the window and first-time payers; keyed on `userId`.
- **`cancellationCohort`** → `{ placed, cancelled }` — orders created in the window and how many are status `cancelled`.
- **`pipeline`** → `PipelineRead` — `$facet` snapshot: pending bank-transfer orders grouped by currency (count, amount, nearest `payBy`) and the count of paid/processing orders not yet shipped.
- **`ORDER_TOTAL`** (internal) — aggregation expression for an order's full total (sum of line `quantity × price` + `shippingCost`), VAT-inclusive.

## Relationships

- **`src/modules/orders/repository.ts`** — every function calls `orderRepository.aggregate(…)`.
- **`src/infrastructure/persistence/report.ts`** — imports `bucketOf` (MongoDB `$dateTrunc`-style expression) and the `ReportWindow` type (`{ from, to, bucketSize }`).
- **`src/shared-kernel/money.ts`** — imports `toMinorUnits` to convert raw decimal sums into the `Money` record, and the `Money` type for return shapes.
- **`src/infrastructure/persistence/create-repository.ts`** — imports `toObjectId` to cast product/user ID strings to MongoDB ObjectIds for matching.
- **`src/modules/orders/services/index.ts`** — barrel file that re-exports this module's public surface for the rest of the order-service layer.

## Notes

- **Deleted orders are invisible** in every count here, but their monetary value remains in the DB (the invoice is never deleted).
- **Category totals are intentionally non-additive**: a product belonging to two categories contributes its sales to both rows.
- **Customer counts key on `userId`, never email** — erased accounts share one placeholder address, so email would under-count.
- **`cancellationCohort` uses `createdAt`, not `paidAt`**, because a cancellation has no reliable "cancel date" to bucket by; the cohort is defined by when the order was placed.
- **`productSeries` matches the product ID twice** (before and after `$unwind`) to let the planner narrow the collection scan early.
- **VAT handling mirrors `orders/domain/tax.ts`**: the frozen per-line `taxRate` is used to back-calculate net amounts, rather than re-deriving tax from the catalogue.
