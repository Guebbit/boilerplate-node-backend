---
source: src/modules/stats/services/sales.ts
source_sha256: 8bbeeed4edbc31b181975c93d5c8036f03cc934a25b973c5b18490ba2142fd3f
context_sha256: 3f712ff14ba882dd5c90cbce75d966530aa8a29cfb8c25bfc412a252bfc7cc3c
generated_at: 2026-11-22T07:52:16.937075+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/services/sales.ts

## Purpose
Builds the sales-over-time statistics for a period. It pulls already-grouped rows from three owning modules (money from `invoicing`, paid orders and units from `orders`, returned units from `returns`) and merges them by currency and bucket. Each owner returns at most a few hundred rows, so this file only merges by key and does no large in-memory join.

## Key elements
- `getSalesStats(period)` (exported): returns `Promise<WithoutLimits<SalesStats>>` containing the period echo and one entry per currency. Each entry has `totals`, `previous` (the previous period's totals), and `buckets`, which has one entry per `period.bucketStarts` with `start` as an ISO string and `figures`.
- `rawFiguresFor(window)`: runs `invoicingService.moneyBuckets`, `orderService.paidBuckets` and `returnService.returnedBuckets` in parallel. It writes their fields into a `ByCurrency` table:
  - invoiced goods, shipping, tax and gross
  - credited goods, shipping, tax and gross
  - `orders` and `unitsOrdered`
  - `unitsReversed`
- `cellOf(table, currency, bucket)`: returns the `RawFigures` cell for a currency and bucket, creating an empty one on first touch. Buckets are keyed by their ISO instant.
- `totalOf(row)`: sums all buckets of one currency with `addRawFigures`. An undefined row gives empty figures.
- `ByCurrency`: type alias for `Map<currency, Map<bucketISO, RawFigures>>`.

## Relationships
- `@modules/invoicing`, `@modules/orders` and `@modules/returns` supply the grouped data through `invoicingService`, `orderService` and `returnService`.
- `@modules/shop` supplies `shopCurrency()`.
- `../domain/figures` supplies `RawFigures`, `emptyRawFigures`, `addRawFigures` and `figuresOf`. `figuresOf` converts raw figures into the output figures for a currency.
- `./range` supplies the `Period` and `WithoutLimits` types. The period provides `window`, `previous`, `echo` and `bucketStarts`.
- `@types` supplies the `SalesStats` type.

## Notes
- The shop's own currency is always included, so an empty period shows zeros. Other currencies appear only if they have data in the current or previous period.
- Currencies are sorted alphabetically.
- Output buckets follow `period.bucketStarts`. Buckets with no data get empty figures. Rows returned by owners whose bucket is not in `bucketStarts` contribute to the totals but are not emitted as buckets.
- The previous period is fetched with the same logic, and only its totals are returned, not its buckets.
- `Object.assign` writes each source's fields onto the cell, so the three sources must write disjoint fields to avoid overwriting one another.
