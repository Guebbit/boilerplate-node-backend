---
source: src/modules/invoicing/services/numbering.ts
sha256: 23b2452e133daa7f41ff696a849ff98493143b28d5bd9b23e6768d9c68d99a66
generated_at: 2026-10-29T04:15:05.906966+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/services/numbering.ts

## Purpose

Allocates gap-free, per-year invoice and credit-note numbers in `{year}-{sequence}` format by incrementing atomic MongoDB counters inside the caller's transaction, and provides a shared recovery helper for duplicate-key races. The transaction requirement ensures a failed insert aborts the increment, so no legal gap (VAT Directive Art. 226(2)) can appear.

## Key elements

- **`allocateInvoiceNumber(issuedAt, session)`** — Increments the invoice counter for the shop-calendar year of `issuedAt` and returns the formatted number. Marked `@internal`; only the invoice-issuing path calls it.
- **`allocateCreditNoteNumber(issuedAt, session)`** — Same pattern against the *independent* credit-note counter. Credit notes never borrow numbers from the invoice series.
- **`readWinner(find)`** — Factory that returns a `catch` handler. On a duplicate-key error it invokes `find()` to read back the winner's document; rethrows any other error or a `null` read.

## Relationships

- **`src/modules/invoicing/repository.ts`** — Delegates the actual counter increment (`incrementInvoiceNumberCounter`, `incrementCreditNoteNumberCounter`) to the repository, passing the `ClientSession` through.
- **`src/infrastructure/persistence/yearly-counter.ts`** — Uses `formatYearlySequence` to turn the raw integer into the `YYYY-N` string.
- **`src/infrastructure/persistence/mongo-errors.ts`** — `readWinner` relies on `isDuplicateKey` to distinguish recoverable races from real errors.
- **`src/modules/orders/index.ts`** (barrel) → **`src/modules/orders/domain/shop-time.ts`** — Imports `yearInZone` to derive the calendar year from the `issuedAt` instant.
- **`src/modules/shop/index.ts`** (barrel) → **`src/modules/shop/service.ts`** — Imports `shopTimezone` to supply the IANA zone for the year calculation.
- **`src/modules/invoicing/services/issue-invoice.ts`** — Calls `allocateInvoiceNumber` inside the invoice-insert transaction.
- **`src/modules/invoicing/services/issue-credit-note.ts`** — Calls `allocateCreditNoteNumber` and `readWinner` in the credit-note path.

## Notes

- Both allocation functions are `@internal` and must never be called outside the invoicing barrel; a number taken outside the issuing transaction is a legal gap.
- The year is computed from `issuedAt` in the **shop timezone**, not the server's local time — a re-download always shows the same number because the instant is immutable.
- `readWinner` is a *handler factory*, not a handler: call it with a `find` closure to get a function suitable for `.catch()`. The `find` callback must read by the same unique key both competing writers shared.
- The `null` check inside `readWinner` is defensive (commented as unreachable unless the unique index is corrupted) but is present to satisfy the type system and fail loudly.
