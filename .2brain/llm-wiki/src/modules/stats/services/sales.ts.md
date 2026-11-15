---
source: src/modules/stats/services/sales.ts
sha256: 5828939d702a63e469d28717f3ef1158f8ea34be04d6f8c35a7b17d0f00c5b65
generated_at: 2026-11-14T22:02:23.075219+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/services/sales.ts

## Purpose

Merges time-bucketed sales data from invoicing (money), orders (paid orders/units), and returns (reversed units) into a single per-currency, per-bucket `SalesStats` response for a given period and its preceding period. Each source arrives pre-aggregated (a few hundred rows at most), so the work here is a key-based merge, not a large join.

## Key elements

- **`getSalesStats(period: Period)`** *(exported)* — Fetches current- and previous-period raw figures in parallel, then assembles the `WithoutLimits<SalesStats>` object: sorted currency list, per-currency totals, previous-period totals, and the full bucket series.
- **`rawFiguresFor(window)`** *(internal)* — Calls `invoicingService.moneyBuckets`, `orderService.paidBuckets`, and `returnService.returnedBuckets` concurrently; merges their rows into a `ByCurrency` table keyed by ISO instant.
- **`cellOf(table, currency, bucket)`** *(internal)* — Get-or-create a `RawFigures` cell inside the nested `Map<string, Map<string, RawFigures>>`.
- **`totalOf(row)`** *(internal)* — Sums every bucket in one currency's row into a single `RawFigures` via `addRawFigures`.
- **`ByCurrency`** *(internal type)* — `Map<currency, Map<bucketISO, RawFigures>>`; the working table shape used during the merge.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/invoicing/index.ts` | Imports `invoicingService`; calls `moneyBuckets(window)` for invoiced/credited amounts. |
| `src/modules/orders/index.ts` | Imports `orderService`; calls `paidBuckets(window)` for order and unit counts. |
| `src/modules/returns/index.ts` | Imports `returnService`; calls `returnedBuckets(window)` for reversed-unit counts. |
| `src/modules/shop/index.ts` | Imports `shopCurrency()` to guarantee the shop's own currency always appears in the result. |
| `src/modules/stats/domain/figures.ts` | Imports `addRawFigures`, `emptyRawFigures`, `figuresOf`, and the `RawFigures` type. |
| `src/modules/stats/services/range.ts` | Imports `Period` and `WithoutLimits` types that define the function signatures. |
| `src/types/index.ts` | Imports the `SalesStats` return shape. |
| `src/modules/stats/services/index.ts` | Re-exports this file's public API as part of the stats service barrel. |

## Notes

- The merge uses `Object.assign` per source: invoicing fills money fields, orders fill `orders`/`unitsOrdered`, returns fill `unitsReversed`. Because the fields are disjoint, order of assignment does not matter, but adding a new source that writes the same key will silently overwrite.
- The shop's own currency is **always** included in the output (even with zero activity), so an empty period yields zeros rather than an empty array. All other currencies appear only if at least one period had activity in them.
- Currencies in the response are sorted alphabetically via `toSorted()`.
- Bucket keys throughout are `Date#toISOString()` strings; callers that receive the result should treat `start` as an ISO-8601 instant, not a timestamp number.
