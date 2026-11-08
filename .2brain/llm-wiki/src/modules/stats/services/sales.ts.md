---
source: src/modules/stats/services/sales.ts
sha256: c23f246ffff46f6451c1a0bd8cc7f15b5628d805be866d45e53b38274488009c
generated_at: 2026-11-08T08:26:08.624431+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/services/sales.ts

## Purpose

Computes sales statistics for a given period by merging three pre-grouped data streams—invoiced money, paid orders, and returned units—into a unified table keyed by currency and time bucket. It exists so the stats layer can present a single "sales over time" view without each domain service knowing about the others.

## Key elements

- **`ByCurrency`** (type) — `Map<currency, Map<bucketISOInstant, RawFigures>>`; the in-memory shape used while merging.
- **`cellOf`** — get-or-create a `RawFigures` cell for a (currency, bucket) pair; ensures the table is fully allocated before values are written.
- **`rawFiguresFor`** — fetches `invoicingService.moneyBuckets`, `orderService.paidBuckets`, and `returnService.returnedBuckets` in parallel, then folds their rows into one `ByCurrency` table.
- **`totalOf`** — sums every bucket in a currency row into a single `RawFigures` via `addRawFigures`.
- **`getSalesStats`** *(exported)* — the public entry point. Resolves current + previous period figures, guarantees the shop's own currency appears even with zero sales, and returns a `WithoutLimits<SalesStats>` with per-currency totals, previous-period totals, and per-bucket figures.

## Relationships

- **`src/modules/invoicing/index.ts`** — imports `invoicingService`; calls `moneyBuckets(window)` for invoiced/credited money.
- **`src/modules/orders/index.ts`** — imports `orderService`; calls `paidBuckets(window)` for order counts and unit totals.
- **`src/modules/returns/index.ts`** — imports `returnService`; calls `returnedBuckets(window)` for reversed units.
- **`src/modules/stats/services/figures.ts`** — imports `addRawFigures`, `emptyRawFigures`, `figuresOf`, and the `RawFigures` type used throughout.
- **`src/modules/stats/services/range.ts`** — imports `Period` and `WithoutLimits` types that shape the public API.
- **`src/modules/shop/index.ts`** — imports `shopCurrency()` to ensure the shop's base currency is always represented in the output.
- **`src/types/index.ts`** — imports the `SalesStats` return type.
- **`src/modules/stats/services/index.ts`** — barrel that re-exports this module to the rest of the stats service layer.

## Notes

- Each upstream service returns already-grouped rows (≤ a few hundred), so merging here is a simple key-based fold—there is no SQL join or large in-memory table.
- Buckets are addressed by `Date.toISOString()` strings; `period.bucketStarts` (from `range.ts`) provides the expected bucket boundaries for the output.
- `getSalesStats` always includes the shop currency in the result set, even when no sales occurred in that period, so consumers can rely on a deterministic set of currencies.
- The function is intentionally stateless and pure with respect to its `period` argument; parallelism comes from `Promise.all` over the three service calls.
