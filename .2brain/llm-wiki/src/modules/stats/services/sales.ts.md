---
source: src/modules/stats/services/sales.ts
sha256: c756ee4cafa3c0e095a0b4766806136583763ef1070653e39f704de0e9aca85f
generated_at: 2026-10-15T12:04:42.325041+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/services/sales.ts

## Purpose

Merges three independent time-bucketed sources — invoiced money, paid orders/units, and returned units — into a single per-currency, per-bucket sales table for a given period and its predecessor. Exists so the stats layer can present a unified "sales over time" view without each consumer re-implementing the merge.

## Key elements

- **`ByCurrency`** (type) — `Map<currency, Map<bucketISO, RawFigures>>`; the in-memory shape used during the merge.
- **`cellOf`** — lazily creates and returns the `RawFigures` cell for a (currency, bucket) pair inside a `ByCurrency` table.
- **`rawFiguresFor`** — calls `invoicingService.moneyBuckets`, `orderService.paidBuckets`, and `returnService.returnedBuckets` in parallel for one window, then folds the rows into a `ByCurrency` table via `Object.assign` (partial overwrite per field).
- **`totalOf`** — reduces all bucket cells of one currency into a single `RawFigures` using `addRawFigures`.
- **`getSalesStats`** *(export)* — fetches current + previous window data, guarantees the shop's own currency is present (zeros if absent), and returns a `SalesStats` object with per-currency totals, previous-period totals, and an aligned array of per-bucket figures.

## Relationships

- **`src/modules/invoicing/index.ts`** — calls `invoicingService.moneyBuckets(window)` to get invoiced/credited amounts per bucket.
- **`src/modules/orders/index.ts`** — calls `orderService.paidBuckets(window)` to get order counts and units per bucket.
- **`src/modules/returns/index.ts`** — calls `returnService.returnedBuckets(window)` to get reversed units per bucket.
- **`src/modules/stats/services/figures.ts`** — imports `addRawFigures`, `emptyRawFigures`, `figuresOf`, and the `RawFigures` type; provides the arithmetic and formatting helpers.
- **`src/modules/stats/services/range.ts`** — imports the `Period` type (window, bucket size, bucket starts, echo string).
- **`src/types/index.ts`** — imports the `SalesStats` return type.
- **`@modules/shop`** (not in neighbor list but imported) — calls `shopCurrency()` to ensure the home currency always appears in results.

## Notes

- Merging is done with `Object.assign` on existing `RawFigures` cells, so each service only fills its own fields; fields it doesn't set remain `0` from `emptyRawFigures`.
- The shop's own currency is force-included in the output even when no sales occurred in that currency for the period — an empty period reads as explicit zeros, not as an absent currency.
- Bucket keys are ISO-8601 strings (`Date.toISOString()`), not `Date` objects, to keep the `Map` keys hashable.
- `toSorted()` (ES 2023) is used for currency ordering; the runtime/target must support it.
- Each owner service is expected to return already-grouped, small result sets (a few hundred rows max); this file performs no aggregation beyond the per-currency `totalOf` sum.
