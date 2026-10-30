---
source: src/modules/stats/services/sales.ts
sha256: c1aa1a79a5c1e466edd938914744c0ac64375fd51f06f235dc242bfb00dbfd58
generated_at: 2026-10-29T05:56:39.476938+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/services/sales.ts

## Purpose

Merges time-bucketed sales data from three domain services (invoicing money, order counts/units, returned units) into a single per-currency, per-bucket structure and formats it as `SalesStats`. It is a thin merge layer — each upstream service already returns grouped rows, so this file only combines them by key without performing a large join.

## Key elements

- **`getSalesStats(period: Period): Promise<SalesStats>`** — the sole export. Fetches current- and previous-period raw figures in parallel, ensures the shop's own currency is always present (zeros for empty periods), and returns sorted currency entries with totals, previous-period totals, and per-bucket figures.
- **`rawFiguresFor(window): Promise<ByCurrency>`** *(internal)* — calls `invoicingService.moneyBuckets`, `orderService.paidBuckets`, and `returnService.returnedBuckets` concurrently via `Promise.all`, then folds each row into a shared `Map<currency, Map<bucketISO, RawFigures>>`.
- **`cellOf(table, currency, bucket)`** *(internal)* — lazily creates and returns the `RawFigures` cell at a (currency, ISO-instant) position.
- **`totalOf(row)`** *(internal)* — sums every bucket in one currency row into a single `RawFigures` using `addRawFigures`.
- **`ByCurrency`** *(type)* — `Map<string, Map<string, RawFigures>>`, keyed by ISO-4217 currency then ISO-8601 bucket instant.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/invoicing/index.ts` / `services/index.ts` | Imports `invoicingService`; calls `moneyBuckets(window)` for invoiced/credited money. |
| `src/modules/orders/index.ts` / `services/index.ts` | Imports `orderService`; calls `paidBuckets(window)` for order counts and units. |
| `src/modules/returns/index.ts` / `services/index.ts` | Imports `returnService`; calls `returnedBuckets(window)` for reversed units. |
| `src/modules/shop/index.ts` / `service.ts` | Imports `shopCurrency()` to guarantee the shop's home currency appears in every result. |
| `src/modules/stats/services/figures.ts` | Imports `addRawFigures`, `emptyRawFigures`, `figuresOf`, and the `RawFigures` type. |
| `src/modules/stats/services/range.ts` | Imports the `Period` type (window, bucket size, previous window, `echo`). |
| `src/types/index.ts` | Imports the `SalesStats` return type. |
| `src/modules/stats/services/index.ts` | Re-exports `getSalesStats` as the module's public API. |

## Notes

- The shop's own currency is **always** included in the output, even when no transactions exist for it — an empty period yields zero-valued figures rather than a missing currency entry. Any *other* currency appears only if at least one service reported data in it.
- Buckets are keyed by the bucket's **first instant** as an ISO-8601 string (`bucket.toISOString()`). The `period.bucketStarts` array drives which bucket slots appear in the response, so a missing cell simply becomes `emptyRawFigures()`.
- `period.echo` is passed through verbatim into the response — it is the canonical period identifier for callers and is not recomputed here.
- The file deliberately avoids building large in-memory structures; the contract is that each upstream service returns at most a few hundred already-grouped rows.
