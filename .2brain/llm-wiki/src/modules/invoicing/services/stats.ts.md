---
source: src/modules/invoicing/services/stats.ts
source_sha256: 25bdff92861ce2a1feadb519c01a5f04933414089fec3e05601f50799a206ce7
context_sha256: 5697793124066795ba51c6e31d5887f96a22c8a6c87e0340c78a808876a56269
generated_at: 2026-11-22T05:37:05.196643+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/services/stats.ts

## Purpose
Computes the money figures for the stats: what was invoiced and what was credited, summed per currency and time bucket. Invoices and credit notes are the frozen, dated (`issuedAt`) rows, so all money figures come from them rather than from orders (no stored total) or payments/refunds (one gross amount, no VAT or shipping split). A document counts on the day it was issued, in the shop's zone.

## Key elements
- `DocumentTotals`: totals for one kind of document in one bucket, in minor units: `documents` (count), `goodsNet` (lines net of VAT, shipping excluded), `shippingNet`, `tax` (goods and shipping VAT combined), and `gross` (VAT and shipping included).
- `MoneyBucket`: one currency and one bucket date, with `invoiced` and `credited` as `DocumentTotals`.
- `moneyBuckets(window)`: the exported entry point. It takes a `ReportWindow` and runs the repository's invoice and credit-note sums in parallel. It then merges the rows into one `MoneyBucket` per `currency|bucket` key and returns them as an array.
- `totalsOf` (private): converts a repository row's summed decimals to `Money` in minor units with `toMinorUnits`, using the row's currency.
- `NONE` (private): zero-valued `DocumentTotals`, built from `NO_MONEY`. It is the default for a side with no documents.

## Relationships
- `src/modules/invoicing/repository.ts`: provides `invoicingRepository` (its `sumInvoices` and `sumCreditNotes` methods) and the `DocumentBucketRow` type.
- `src/domain-primitives/money.ts`: provides `Money`, `NO_MONEY` and `toMinorUnits`.
- `src/infrastructure/persistence/report.ts`: provides the `ReportWindow` type (a half-open window plus the bucket size).
- `src/modules/invoicing/services/index.ts` and `scripts/docs/generate-role-matrix.ts` are graph neighbors, but this file does not import them.

## Notes
- A bucket that has only invoices or only credit notes still gets a `MoneyBucket`, with the missing side set to `NONE`.
- The returned array follows Map insertion order (invoice rows first, then credit-note-only buckets), not a sorted order.
- Rows are matched by `currency` and the bucket's ISO timestamp, so the repository must return identical bucket dates for both queries.
- Per the module doc, an invoice is issued seconds after its payment, and a credit note at its refund's settlement.
