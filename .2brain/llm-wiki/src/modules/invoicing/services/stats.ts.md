---
source: src/modules/invoicing/services/stats.ts
sha256: 25bdff92861ce2a1feadb519c01a5f04933414089fec3e05601f50799a206ce7
generated_at: 2026-10-29T04:15:50.941472+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/stats.ts

## Purpose

Computes invoiced and credited money totals per currency and time bucket. It is the authoritative source for every money figure in stats: invoices and credit notes are the frozen, dated rows (`issuedAt`) that carry the full VAT/shipping split, whereas orders store no total and refunds hold only a single gross amount.

## Key elements

- **`DocumentTotals`** (interface) — one document type's sum in one bucket: `documents` count, `goodsNet`, `shippingNet`, `tax`, `gross` (all `Money` in minor units).
- **`MoneyBucket`** (interface) — one currency × one bucket, carrying both an `invoiced` and a `credited` `DocumentTotals`.
- **`NONE`** (const) — zero-value `DocumentTotals` used as the default for whichever side has no rows in a bucket.
- **`totalsOf`** (internal helper) — converts a `DocumentBucketRow` (summed decimals) into a `DocumentTotals` via `toMinorUnits`.
- **`moneyBuckets(window: ReportWindow)`** (exported) — the main entry point. Calls `invoicingRepository.sumInvoices` and `sumCreditNotes` in parallel, merges their rows into a `Map` keyed on `currency|bucket.toISOString()`, and returns `MoneyBucket[]`.

## Relationships

- **`src/domain-primitives/money.ts`** — provides the `Money` type, the `NO_MONEY` sentinel, and the `toMinorUnits` conversion used to lift repository decimals into the domain representation.
- **`src/infrastructure/persistence/report.ts`** — supplies the `ReportWindow` type (half-open date range + bucket size) that parameterises the query.
- **`src/modules/invoicing/repository.ts`** — source of the raw data: `invoicingRepository.sumInvoices(window)` and `.sumCreditNotes(window)` return `DocumentBucketRow[]` arrays that this module aggregates.
- **`src/modules/invoicing/services/index.ts`** — barrel file for the invoicing services directory; re-exports this module so consumers can import `moneyBuckets` via the services index.

## Notes

- Bucketing is by the document's **issue date in the shop's zone**. An invoice follows its payment by seconds; a credit note follows its refund's settlement.
- If a bucket has invoices but no credit notes (or vice-versa), the missing side is filled with the `NONE` constant rather than omitted.
- `totalsOf` is intentionally **not** exported — it is a thin adapter from the repository row shape to the public `DocumentTotals` shape.
- The merge key is a plain string concatenation (`currency|bucket.toISOString()`); no dedicated tuple or struct is used.
