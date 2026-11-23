---
source: src/modules/invoicing/services/numbering.ts
source_sha256: 751e26058d91a942d771c8908822d9290ab5a96ffef3730e07734b1e41fcce33
context_sha256: c85a624955568ada83225912c37988140ef41ddc5bdfe0a7fce06a838e6d9f1b
generated_at: 2026-11-22T05:36:01.886335+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/services/numbering.ts

## Purpose
Turns each invoicing series' atomic yearly counter into its printed number, formatted `{year}-{sequence}` (the same format as order numbers, via `formatYearlySequence`). Unlike order numbers, these series must be gap-free (VAT Directive Art. 226(2); a credit note counts as an invoice under Art. 219). Allocation therefore happens inside the transaction that inserts the document, so a lost race aborts and gives the number back.

## Key elements
- `allocateInvoiceNumber(issuedAt, session)` — takes the shop-calendar year of `issuedAt` (via `yearInZone` and `shopTimezone()`), increments the invoice counter for that year, and returns the formatted number. `session` is required.
- `allocateCreditNoteNumber(issuedAt, session)` — same, but uses the separate credit-note counter. It is an independent series, so a credit note never borrows a number from the invoice series it corrects.
- `readWinner(find)` — returns a `catch` handler for lost races. It rethrows any error that is not a duplicate-key error. On a duplicate key it calls `find()` and returns the winner's document. If `find()` returns nothing, it rethrows the original error.

## Relationships
- `src/infrastructure/persistence/yearly-counter.ts` — supplies `formatYearlySequence`.
- `src/infrastructure/persistence/mongo-errors.ts` — supplies `isDuplicateKey`, used by `readWinner`.
- `src/domain-primitives/time.ts` — supplies `yearInZone`.
- `src/modules/invoicing/repository.ts` — supplies `invoicingRepository`, whose counter-increment methods (one per series) do the actual increments.
- `src/modules/shop/index.ts` — supplies `shopTimezone()`, which reads `NODE_SHOP_TIMEZONE`.
- `src/modules/invoicing/services/issue-invoice.ts`, `issue-credit-note.ts` and `correct-invoice.ts` — the issuing paths that sit above this file. The docs describe both issuing paths as using `readWinner` to recover from a race.

## Notes
- The allocators are marked `@internal`: they must only be called from the issuing path, which decides whether a document may be issued. A number taken outside that path is a legal gap, and the functions never leave the module barrel.
- The invoice number is allocated once per order, from the `ORDER_STATUS_CHANGED` listener that issues the invoice. A re-downloaded PDF therefore always shows the same number.
- The year is derived from the same `issuedAt` instant that is stored on the document, so number and date cannot disagree.
- The "no existing document" branch in `readWinner` is unreachable unless the unique index is corrupted.
