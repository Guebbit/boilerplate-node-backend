---
source: src/modules/invoicing/tests/unit/credit-shares.test.ts
source_sha256: 71ef0286d59f6b903e4b331939baf0bb3e3aa98b3aa0166e05a820c84f2c450d
context_sha256: cf1c5046886b928ad2eefb6d18d97adb4245daac533e1330c27687e9dbff952b
generated_at: 2026-11-22T05:39:56.579768+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/unit/credit-shares.test.ts

## Purpose
Unit tests for `creditShares`, the domain function that spreads a refunded amount across an invoice's VAT rates and returns credit-note lines. It uses pure in-memory data, with no database and no tax function, so it pins the arithmetic only. The module doc says other test files cover that the figures add up and the real refund flow.

## Key elements
- **`invoice` fixture**: a `CreditableInvoice` with 110.00 gross at 10% and 122.00 gross at 22% (232.00 total), and no `lines` or `shippingByRate`.
- **`describe('creditShares')`**: whole-invoice refunds, with no goods specified.
  - Proportional split by each rate's collected gross: 23.20 gives `11.00` at 10% and `12.20` at 22%.
  - Every line's `taxRate` is one the invoice charged.
  - A rate whose share rounds to zero is omitted: 0.01 gives a single line.
  - The odd cent goes to the heaviest rate: 10.00 over weights 18.25 / 44.05 gives `2.92` / `7.08`.
- **`describe('creditShares — a refund for specific goods')`**: uses a `mixed` invoice with a book (BOOK, 10%, 2 × 11.00), a lamp (LAMP, 22%, 1 × 61.00) and delivery split 2.20 / 10.00 across the two rates. The fourth argument is `{ lines: [{ productId, quantity }], shipping }`.
  - Returning one book gives a single line at 10%.
  - Refunding all goods plus 12.20 shipping weights each rate by goods plus shipping (24.20 and 71.00).
  - A refund smaller than its goods (a deduction) is spread only over the returned goods' rates.
  - If no returned `productId` is on the invoice, it falls back to all rates.

## Relationships
- Imports `creditShares` and the `CreditableInvoice` type from `../../domain`, the domain barrel `src/modules/invoicing/domain/index.ts`. The implementation is in `src/modules/invoicing/domain/credit-shares.ts`.

## Notes
- Amounts are decimal strings (`'11.00'`), and output lines always have `title`, `quantity: 1`, `unitPrice` and `taxRate`.
- The test titled "never invents a rate" uses `0.07`, an amount that does not divide evenly, to check rounding.
- Rate weights for goods refunds are built from line gross (unit price × quantity) plus the shipping allocated to that rate.
