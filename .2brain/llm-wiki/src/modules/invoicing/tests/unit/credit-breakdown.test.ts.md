---
source: src/modules/invoicing/tests/unit/credit-breakdown.test.ts
source_sha256: a84f06df8d5180ae61befb8691a04457cb5581821369f34d56a4215445071820
context_sha256: db51d75cdf3500e4efa29f535fcdbe76b4d0ff2f1306c58453aed3c891d3ef70
generated_at: 2026-11-22T05:39:43.930309+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/tests/unit/credit-breakdown.test.ts

## Purpose
Unit tests for `creditBreakdownOf` (from `services/credit-breakdown`) fed by `creditShares` (from the invoicing `domain`). They check that the figures of a partial credit note add up: VAT is extracted once per rate, and the gross reconciles to the refunded amount to the cent.

## Key elements
- `invoice` — fixture `CreditableInvoice` in EUR with two tax-summary rows: 110.00 at 10% and 122.00 at 22% (232.00 gross), with no lines and no shipping.
- `breakdownOf(source, amount)` — helper that runs `creditBreakdownOf(creditShares(source, amount, 'Refund'), source.currency)`.
- Test cases in `describe('creditBreakdownOf')`:
  - **Reconciliation:** refunding 50.00 gives summary-row gross values that sum to exactly 5000 cents, and `netTotal + taxTotal` is about 50.
  - **Shipping:** `shippingNetAmount` is `'0.00'` and `shippingByRate` is `[]`, because the shipped share is folded into the rate rows.
  - **Mixed rates:** refunding 10.00 of an invoice with 18.25 at 10% and 44.05 at 22% gives 2.92 gross at 10% and 7.08 at 22%. Each rate is taxed once, with totals net 8.45 and tax 1.55. The expected figures follow the rounding in the inline comments.
  - **Zero-decimal currency:** JPY refunding 105 at 8% gives net `'97'`, tax `'8'` and gross `'105'`, with no decimals.
  - **Returned book:** `creditShares` is called with an options object (`lines: [{ productId: 'book', quantity: 1 }]`, `shipping: '0.00'`). The credit is then only at the book's 10% rate: net 10.00, tax 1.00, gross 11.00.

## Relationships
- `src/modules/invoicing/domain/credit-shares.ts` — provides `creditShares` and the `CreditableInvoice` type (both imported from `../../domain`). `creditShares` turns an invoice and an amount into the shares that are tested.
- `src/modules/invoicing/services/credit-breakdown.ts` — provides `creditBreakdownOf`, the unit under test. It takes the shares and a currency and returns `taxSummary`, `netTotal`, `taxTotal`, `shippingNetAmount` and `shippingByRate`.

## Notes
- The tests use real domain and service code, with no mocks.
- Amounts are decimal strings. Tests compare them as strings, or through `Number` and cent rounding where reconciliation is the point.
- Rounding is per rate, on the gross share. The tax is `round(gross × rate/(1+rate))` and the net is gross minus tax. The comments in the mixed-rate and JPY tests show the arithmetic.
