---
source: src/infrastructure/persistence/yearly-counter.ts
sha256: 136de4cbc9a8808a59d9fe0ba84f477d0775d0e9694eee654d9adf76ff07f902
generated_at: 2026-11-08T03:45:38.081683+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/persistence/yearly-counter.ts

## Purpose

Provides the shared atomic counter and formatting helpers behind the `{year}-{sequence}` number scheme. Both the invoicing and orders modules use it, but each owns its own Mongoose counter collection and decides how the `session` parameter interacts with its own transactional guarantees (gaps are tolerated for orders, forbidden for invoices).

## Key elements

- **`YearlyCounterDocument`** — Mongoose document shape: `_id` is the calendar year, `seq` is the last number issued.
- **`incrementYearlyCounter(counterModel, year, session?)`** — Atomically upserts the year's row via `findOneAndUpdate` + `$inc`, returning the new `seq`. Passing a `ClientSession` enrolls the bump in that transaction so an abort rolls the number back.
- **`formatYearlySequence(year, sequence)`** — Renders the printable form `{year}-{NNNNNN}`, zero-padding the sequence to six digits.
- **`SEQUENCE_WIDTH`** (6) — Constant controlling the zero-pad width; not exported.

## Relationships

- **`src/modules/orders/services/order-numbering.ts`** and **`src/modules/invoicing/services/numbering.ts`** — The service-layer callers that invoke `incrementYearlyCounter` (supplying their own model and session) and `formatYearlySequence` to build the final number string.
- **`src/modules/orders/repository.ts`** and **`src/modules/invoicing/repository.ts`** — Define and own the per-module `Model<YearlyCounterDocument>` instance that is passed into `incrementYearlyCounter`; this keeps the two series in separate collections.
- **`tests/unit/infrastructure/persistence/yearly-counter.test.ts`** — Unit tests covering the counter increment and formatting logic.

## Notes

- The counter model is **not** a module-level singleton; it is an injected parameter. Each business module must create and pass its own `Model<YearlyCounterDocument>` so order and invoice sequences never share a collection.
- `session` is optional. Callers that need strict no-gap semantics (invoicing) must pass the active `ClientSession`; callers that tolerate gaps (orders) may omit it. The function itself is agnostic.
- The upsert relies on `returnDocument: 'after'`; without it the first call for a new year would return `0` instead of `1`.
