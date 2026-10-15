---
source: src/modules/invoicing/services/stats.ts
sha256: 003c2c146fe9a90df93334d892ec32c06938886668db3cdd9fd00f65ce0586b6
generated_at: 2026-10-15T10:39:55.611026+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/stats.ts

## Purpose

Computes per-currency, per-bucket money totals (invoiced vs. credited) from frozen invoice and credit-note rows. It exists as the single source of money figures for reporting because orders carry no totals and refunds carry no VAT/shipping split—only issued documents do.

## Key elements

- **`DocumentTotals`** (interface) — shape of one document-type aggregate: `documents` count plus `goodsNet`, `shippingNet`, `tax`, `gross` as `Money` (minor units).
- **`MoneyBucket`** (interface) — one currency + bucket date, holding side-by-side `invoiced` and `credited` `DocumentTotals`.
- **`NONE`** (const) — zeroed `DocumentTotals` used as the initial value when a bucket has no rows for a document type.
- **`totalsOf`** (private helper) — converts a `DocumentBucketRow` (decimal columns) into a `DocumentTotals` via `toMinorUnits`.
- **`moneyBuckets`** (exported function) — accepts a `ReportWindow`, calls `invoicingRepository.sumInvoices` and `.sumCreditNotes` concurrently, merges the two result sets into a `Map` keyed by `currency|bucketISO`, and returns `MoneyBucket[]`.

## Relationships

- **`src/shared-kernel/money.ts`** — imports `NO_MONEY`, `toMinorUnits`, and the `Money` type; all monetary values in this file are expressed in minor units via that module.
- **`src/infrastructure/persistence/report.ts`** — imports the `ReportWindow` type that defines the half-open date window and bucket size passed into `moneyBuckets`.
- **`src/modules/invoicing/repository.ts`** — imports `invoicingRepository` (the data-access layer) and the `DocumentBucketRow` row shape; all SQL aggregation lives in the repository, this file only maps and merges.
- **`src/modules/invoicing/services/index.ts`** — re-exports this module's public API (`moneyBuckets`, `DocumentTotals`, `MoneyBucket`) to consumers.

## Notes

- Bucketing key is `currency + ISO date string`; two rows that differ only in document type (invoice vs. credit-note) land in the same `MoneyBucket` cell.
- Dates are interpreted in the shop's timezone before bucketing (handled upstream in the repository query); this file trusts the `bucket` value it receives.
- `goodsNet` excludes shipping; `tax` and `gross` include it. Don't add `goodsNet + shippingNet` expecting `gross`—`gross` also carries tax.
- The function is async but performs no I/O itself; the `Promise.all` wraps two repository calls.
