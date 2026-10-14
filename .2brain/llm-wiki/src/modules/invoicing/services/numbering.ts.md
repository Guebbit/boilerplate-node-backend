---
source: src/modules/invoicing/services/numbering.ts
sha256: 4f921ce6e75ef44297975eeec95d4ecc753f4b5a652b44817c0277acf4140407
generated_at: 2026-10-14T16:09:42.979836+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/numbering.ts

## Purpose

Allocates and formats the next sequential number for invoices and credit notes within a shop-calendar year. Each series (invoice, credit note) has its own atomic counter, so numbers are gap-free: the increment happens inside the same Mongoose transaction that inserts the document, and a lost race aborts the whole transaction. The output format (`YYYY-NNNNNN`) intentionally mirrors the order-numbering convention.

## Key elements

- **`SEQUENCE_WIDTH`** (const, `6`) — zero-padding width for the sequence portion; kept in sync with the orders module.
- **`formatNumber(year, sequence)`** (internal) — produces the `2025-000041` string.
- **`allocateInvoiceNumber(issuedAt, session?)`** — computes the shop-calendar year from `issuedAt`, atomically increments the invoice counter via the repository, and returns the formatted number. Called once per order at issue time.
- **`allocateCreditNoteNumber(issuedAt, session?)`** — same pattern against the independent credit-note counter. A credit note never borrows from the invoice series.

## Relationships

- **`src/modules/invoicing/repository.ts`** — provides `invoicingRepository.incrementInvoiceNumberCounter(year, session)` and `incrementCreditNoteNumberCounter(year, session)`, the atomic DB operations this module delegates to.
- **`src/modules/invoicing/services/issue-invoice.ts`** — caller of `allocateInvoiceNumber`.
- **`src/modules/invoicing/services/issue-credit-note.ts`** — caller of `allocateCreditNoteNumber`.
- **`src/modules/invoicing/services/index.ts`** — barrel that re-exports these functions for external consumers.
- **`src/modules/orders/domain/shop-time.ts`** — exports `yearInZone`, used to derive the year from `issuedAt` in the shop timezone.
- **`src/modules/orders/config.ts`** — exports `shopTimezone`, the timezone value passed to `yearInZone`.
- **`src/modules/orders/index.ts`** — barrel from which `shopTimezone` and `yearInZone` are imported (single `@modules/orders` import).

## Notes

- **Year is derived from `issuedAt`, not "now."** The number and the printed date cannot disagree even if allocation happens seconds after the issue instant.
- **Transactional, not advisory.** Both allocation functions require the caller to pass the `ClientSession` that is also used to insert the document; without it the increment is non-transactional and gap-free guarantees are lost.
- **Idempotency by design.** `allocateInvoiceNumber` is called exactly once per order (from the `ORDER_STATUS_CHANGED` listener). A re-downloaded PDF reads the stored number rather than re-allocating.
- **VAT compliance.** The gap-free, two-series design satisfies VAT Directive Art. 226(2) (sequential invoice numbering) and Art. 219 (credit notes are invoices in law), keeping the two series legally independent.
