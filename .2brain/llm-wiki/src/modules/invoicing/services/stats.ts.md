---
source: src/modules/invoicing/services/stats.ts
sha256: 25bdff92861ce2a1feadb519c01a5f04933414089fec3e05601f50799a206ce7
generated_at: 2026-11-08T06:16:07.534902+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/stats.ts

## Purpose

Aggregates invoiced and credited amounts per currency and time-bucket for reporting. It is the single source of money figures in stats because invoices and credit notes are the frozen, dated rows (`issuedAt`); orders carry no total and refunds carry no VAT/shipping split.

## Key elements

- **`DocumentTotals`** (interface) — Shape of one document-type sum per bucket: `documents`, `goodsNet`, `shippingNet`, `tax`, `gross` (all `Money`, i.e. minor units).
- **`MoneyBucket`** (interface) — One currency + bucket pairing holding both `invoiced` and `credited` `DocumentTotals`.
- **`moneyBuckets(window: ReportWindow)`** (exported function) — Calls `sumInvoices` and `sumCreditNotes` in parallel, merges the two result sets into a `Map` keyed by `currency|bucketISO`, and resolves with `MoneyBucket[]`.
- **`NONE`** (private const) — Zero-valued `DocumentTotals` used as the initial cell before a row overwrites it.
- **`totalsOf(row)`** (private helper) — Converts a repository `DocumentBucketRow` (decimal `number` fields) into a `DocumentTotals` via `toMinorUnits`.

## Relationships

- **`@domain-primitives/money`** — Imports `Money` type, `NO_MONEY` sentinel, and `toMinorUnits` for decimal→minor-unit conversion.
- **`@infrastructure/persistence/report`** — Imports the `ReportWindow` type (half-open window + bucket size) that drives the query range and grouping.
- **`../repository`** — Imports `invoicingRepository` (calls `sumInvoices`, `sumCreditNotes`) and the `DocumentBucketRow` row shape.
- **`services/index.ts`** — Barrel file that re-exports this module so consumers can `import { moneyBuckets }` from the services package root.

## Notes

- Money is always stored/returned in **minor units** (`Money`); the repository rows arrive as human-readable decimals and are converted in `totalsOf`.
- Buckets are keyed by `currency` + ISO date string internally; the exposed `bucket` field is a `Date`, so callers should be aware the granularity (day, week, etc.) is determined by the `ReportWindow` they pass in.
- The `NONE` constant is shared across all cells that haven't yet been overwritten. Because every field is an immutable primitive or a `Money` value object, aliasing is safe in practice, but callers must not mutate returned `MoneyBucket` objects.
