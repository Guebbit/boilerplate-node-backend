---
source: src/modules/invoicing/services/numbering.ts
sha256: a91ec96bbc35d1bdb371e06369d44eff80ae8bb143f4e6857f39765dd5cd2dfe
generated_at: 2026-11-08T06:15:12.415257+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/numbering.ts

## Purpose

Allocates gap-free, per-year invoice and credit-note numbers (`{year}-{sequence}`) that are always taken inside the same Mongoose transaction as the document insert. This guarantees no legal number gap (VAT Directive Art. 226(2), Art. 219) and provides a single recovery path for the rare lost-race duplicate-key collision.

## Key elements

- **`allocateInvoiceNumber(issuedAt, session)`** — Computes the shop-calendar year from `issuedAt`, increments the invoice counter via the repository (within the given `ClientSession`), and returns a formatted `"{year}-{seq}"` string. Marked `@internal`; intended to be called once per order from the issuing path.
- **`allocateCreditNoteNumber(issuedAt, session)`** — Same shape as above but increments the independent credit-note counter, so credit notes never borrow from the invoice series.
- **`readWinner<TDocument>(find)`** — Returns a `catch` handler. If the error is a duplicate-key violation it calls `find()` to read back the winner's document; otherwise it rethrows. Serves as the shared recovery for both issuing paths.

## Relationships

- **`src/infrastructure/persistence/yearly-counter.ts`** — imports `formatYearlySequence` to render the `{year}-{seq}` string.
- **`src/domain-primitives/time.ts`** — imports `yearInZone` to derive the calendar year in the shop timezone.
- **`src/modules/shop/index.ts`** — imports `shopTimezone` as the timezone authority for year computation.
- **`src/modules/invoicing/repository.ts`** — imports `invoicingRepository` to call `incrementInvoiceNumberCounter` / `incrementCreditNoteNumberCounter`.
- **`src/infrastructure/persistence/mongo-errors.ts`** — imports `isDuplicateKey` for the `readWinner` guard.
- **`src/modules/invoicing/services/issue-invoice.ts`** — the expected caller of `allocateInvoiceNumber` and `readWinner` (the "issuing path" referenced in docs).
- **`src/modules/invoicing/services/issue-credit-note.ts`** — the expected caller of `allocateCreditNoteNumber` and `readWinner`.

## Notes

- **Transaction is mandatory.** Both `allocate*` functions require a `ClientSession`. Taking a counter outside the insert transaction creates a legal gap if the insert subsequently fails; the JSDoc explicitly calls this out.
- **Independent counters.** Invoice and credit-note series are separate; a credit note correcting invoice `2025-0042` will not consume the next invoice sequence number.
- **`@internal` boundary.** All three exports are documented as internal to the invoicing barrel; they are not part of the public module API.
- **`readWinner` null-case is defensive.** The comment states that a `null` from `find()` after a confirmed duplicate-key is unreachable (the duplicate key itself is the existence guarantee); it throws the original error in that case.
- **Year source is `issuedAt`, not "now."** This prevents the printed year from disagreeing with the stored issue date across a year boundary.
