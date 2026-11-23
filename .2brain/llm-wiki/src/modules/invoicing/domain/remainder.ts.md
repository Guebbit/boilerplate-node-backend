---
source: src/modules/invoicing/domain/remainder.ts
source_sha256: d9faec7716d318900c48d5ca972137bfd7f6e4ed7900544173f337874f8378c4
context_sha256: 61b13449a6123c6f379018d753d7b01c0f3dacfa8a661cd71cabbe6df2217e5f
generated_at: 2026-11-22T05:30:48.788412+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/domain/remainder.ts

## Purpose
Pure arithmetic that computes what an invoice still stands for after earlier credit notes have taken part of it. It is used when correcting an invoice: the original is cancelled and the remainder reissued, so the same money is never credited twice. It needs no database, so it is easy to unit test.

## Key elements
- `remainderLines(invoiceSummary, creditSummaries, currency, title): CreditLine[]` is the only export.
  - For each VAT-rate row of the invoice's `taxSummary`, it sums the `grossAmount` of every credit-note summary row with the same `rate`. It subtracts that sum from the invoice's gross for the rate.
  - If the amount left is greater than zero, it emits one line: `quantity: 1`, `unitPrice` set to the remainder as a decimal string, `taxRate` set to the row's rate, and the given `title`.
  - Rates with nothing left produce no line. The result keeps the invoice's rate order and is empty once nothing remains.
- `RateGross` is a non-exported interface (`rate`, `grossAmount` string) describing a summary row as the remainder reads it.

## Relationships
- `@domain-primitives/money` (`src/domain-primitives/money.ts`) provides the money arithmetic: `addMoney`, `subtractMoney`, `toMinorUnits`, `toDecimalString`, `NO_MONEY` and the `Money` type. All amounts are handled in minor units and converted back to decimal strings.
- `./credit-shares` (`credit-shares.ts`) provides the `CreditLine` type. Remainder lines are built the way a partial credit note's lines are.
- `src/modules/invoicing/tests/unit/remainder.test.ts` is the unit test for this file.
- `src/modules/invoicing/domain/index.ts` and `src/modules/invoicing/services/figures.ts` are graph neighbors. This file's content shows no direct interaction with either.

## Notes
- Amounts are gross (VAT-inclusive). Each line's `unitPrice` is the gross remainder, and the VAT is extracted from these lines afterwards rather than here.
- Credit rows are matched to invoice rows by strict equality on `rate`. A credit-note rate with no matching invoice row is ignored.
- A rate whose credits equal or exceed the invoice gross yields no line, since only a positive remainder is emitted. Over-crediting is not reported as an error.
- The caller supplies `title` already translated into the invoice's language.
