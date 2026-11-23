---
source: src/infrastructure/persistence/yearly-counter.ts
source_sha256: 27f0109018851e25db6300b630bfcef0d4872b53b4fbed5c3b4dfe57495c9f62
context_sha256: ad4c4b380d14bdf83450be5358dff4c57ffec849af2bf08e0b3abee3b2a0fd70
generated_at: 2026-11-22T03:05:24.535666+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/persistence/yearly-counter.ts

## Purpose
Provides the shared yearly counter behind `{year}-{sequence}` document numbers. Each year has one counter document, incremented by a single atomic upsert. Order numbers and invoice numbers both use it. Each module supplies its own counter model and decides what `session` means for its series. Gaps are acceptable for orders and illegal for invoices.

## Key elements
- `YearlyCounterDocument` — Mongoose `Document<number>` interface. `_id` is the calendar year and `seq` is the last number handed out.
- `incrementYearlyCounter(counterModel, year, session?)` — runs `findOneAndUpdate({ _id: year }, { $inc: { seq: 1 } })` with `upsert: true` and `returnDocument: 'after'`. It creates the year's row on first use and resolves to the new `seq` (1 for the year's first document). The optional `ClientSession` ties the increment to a transaction, so an abort gives the number back.
- `formatYearlySequence(year, sequence)` — returns `` `${year}-${sequence}` `` with the sequence zero-padded to 6 digits (`SEQUENCE_WIDTH`), e.g. `2026-000041`.

## Relationships
- `src/modules/invoicing/services/numbering.ts` and `src/modules/orders/services/order-numbering.ts` are the number-generating services for the two series. By the module doc, both series use this counter.
- `src/modules/invoicing/repository.ts` and `src/modules/orders/repository.ts` are the persistence layers of the two modules. Per the module doc, each module owns its own counter model, which it passes in as `counterModel`.
- `tests/unit/infrastructure/persistence/yearly-counter.test.ts` is the unit test for this file.

## Notes
- The file defines no counter collection itself. Callers must pass a model for their own series, so orders and invoices keep separate sequences.
- Without a `session`, the increment is not part of any transaction, so an abort elsewhere cannot give the number back.
- Rollback semantics are the caller's responsibility. This helper only forwards the session.
- The increment and the formatting are separate functions. Callers pass the number returned by `incrementYearlyCounter` to `formatYearlySequence`.
- A sequence wider than six digits is not truncated. `padStart` only pads.
