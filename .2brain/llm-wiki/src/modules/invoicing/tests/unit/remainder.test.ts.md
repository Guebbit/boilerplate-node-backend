---
source: src/modules/invoicing/tests/unit/remainder.test.ts
source_sha256: ab27c566ef01063bb82b0e8f56e8b1f84b1b88241123c8ec6a9108fec751e95d
context_sha256: cee2857392f4a3aedad63319033afdee2c0d10d94d7d50252eafe79edff27aef
generated_at: 2026-11-22T05:40:39.386674+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/unit/remainder.test.ts

## Purpose
Unit tests for `remainderLines`, which computes what an invoice still stands for after credit notes have been applied against it. The function takes plain data and returns lines, so the tests need no database or fixtures. The file header points to `src/modules/invoicing/tests/integration/correct-invoice.test.ts` for coverage through a real correction.

## Key elements
- `INVOICE`: fixture with two per-rate gross amounts, 110.00 at 10% and 122.00 at 22%.
- `describe('remainderLines')`: contains three cases. Each calls `remainderLines(invoice, creditNotes, 'EUR', title)`.
  - **Nothing credited:** returns one line per rate, shaped `{ title, quantity: 1, unitPrice, taxRate }`. The title is the one passed in (`'Rest'`), and `unitPrice` is the full gross amount.
  - **Credits applied per rate:** two credit notes on the 22% rate (22.00 and 0.50) reduce that rate to `'99.50'`. The 10% rate stays at `'110.00'`, so a credit only reduces the rate it names.
  - **Credited in full:** a rate that is fully credited is left out of the result. When every rate is fully credited (here the credit notes are `[INVOICE]`), the result is `[]`.

## Relationships
- Imports `remainderLines` from `src/modules/invoicing/domain/index.ts`, the domain barrel. The function itself is implemented in `src/modules/invoicing/domain/remainder.ts`.

## Notes
- Credit notes are passed as an array of arrays. Each inner array holds `{ rate, grossAmount }` entries for one credit note.
- Amounts are strings with two decimals (`'99.50'`), and the tests compare them as strings, so the result format is fixed.
- The tests pass `'EUR'` as the third argument. None of them checks its effect, so what it does is not shown here.
