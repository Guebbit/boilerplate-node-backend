---
source: src/infrastructure/persistence/yearly-counter.ts
sha256: 136de4cbc9a8808a59d9fe0ba84f477d0775d0e9694eee654d9adf76ff07f902
generated_at: 2026-10-29T02:14:15.547321+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/yearly-counter.ts

## Purpose

Provides the shared atomic counter mechanism behind all `{year}-{sequence}` identifiers in the system. One Mongoose document per calendar year is bumped via an `upsert`, yielding the next sequence number. Both the order and invoice modules reuse this primitive; each supplies its own `Model` and `ClientSession`, so the semantics of the number (gap-tolerant vs. gap-illegal) stay with the calling module.

## Key elements

- **`YearlyCounterDocument`** – Mongoose document shape: `_id` is the calendar year, `seq` is the last number issued.
- **`incrementYearlyCounter(counterModel, year, session?)`** – Atomically takes the next sequence for a given year (creates the year's row on first use). Returns the number just taken (1 for the first). Accepts an optional `ClientSession` so the number is released on transaction abort.
- **`formatYearlySequence(year, sequence)`** – Renders the human-facing string `{year}-{seq}` with the sequence zero-padded to six digits (e.g. `2025-000041`).
- **`SEQUENCE_WIDTH`** – Module-private constant (6) controlling padding width.

## Relationships

- **`src/modules/orders/services/order-numbering.ts`** / **`src/modules/invoicing/services/numbering.ts`** – Call `incrementYearlyCounter` and `formatYearlySequence` to mint their respective numbers. Each passes its own counter `Model` and transaction session.
- **`src/modules/orders/repository.ts`** / **`src/modules/invoicing/repository.ts`** – Define (or expose) the per-module counter collection/model that is handed into `incrementYearlyCounter`.
- **`tests/unit/infrastructure/persistence/yearly-counter.test.ts`** – Unit-tests `incrementYearlyCounter` and `formatYearlySequence` in isolation.

## Notes

- The function is deliberately model-agnostic: it receives a `Model<YearlyCounterDocument>` parameter rather than importing a concrete collection. This is what lets orders and invoices share the code while owning separate collections and transaction semantics.
- `session` is optional. Omitting it means the increment is not part of any transaction and will survive an abort—appropriate for order numbering where gaps are acceptable. Invoice numbering must always pass a session.
- The Mongoose `upsert` + `returnDocument: 'after'` combination is the whole atomicity guarantee; there is no separate `findOne` followed by `update`.
