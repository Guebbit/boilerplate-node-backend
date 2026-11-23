---
source: src/modules/products/tax.ts
source_sha256: 194cfbfb0e026e3def117da2dfe7f550ccf6bbd7ad00e588e060ae4e15596426
context_sha256: 47c6d76958334b40a4a5c1138e4b26926829f2e53213944960c3318f0d12606a
generated_at: 2026-11-22T07:14:43.707556+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tax.ts

## Purpose
Resolves a product's tax class into the decimal VAT rate actually charged. It lives with the product model rather than in `orders` because "every product resolves to a rate" is a catalogue invariant. `orders` freezes whatever this returns and does not decide it.

## Key elements
- `TaxClass`: type alias for the values a product's `taxClass` may hold. It is `NonNullable<Product['taxClass']>` and mirrors `TaxClass` on the contract.
- `RateType`: type alias for the values a product's `rateType` may hold. It is `NonNullable<Product['rateType']>` and mirrors `RateType` on the contract. It is never resolved into anything. It is frozen onto an order line as-is, and an invoice reads it straight from that freeze.
- `resolveTaxRate(taxClass?)`: returns the decimal rate (0.22 means 22%).
  - `'zero'` returns `0`.
  - `'reduced'` returns `vatRateReduced()`.
  - Anything else returns `vatRateDefault()`. That includes `undefined` and unrecognized values.

## Relationships
- `src/modules/products/config.ts`: supplies `vatRateDefault` and `vatRateReduced`, the actual rate values that `resolveTaxRate` returns.
- `src/types/index.ts`: provides the `Product` type (imported via `@types`) that `TaxClass` and `RateType` are derived from.
- `src/modules/orders/services/snapshot.ts`: the doc comments name it as the place where the resolved rate and `rateType` are frozen onto order lines. The invoice reads `rateType` from that freeze.
- `src/modules/products/tests/unit/tax.test.ts`: unit tests for this module.
- `src/modules/products/index.ts`, `src/modules/orders/tests/factories.ts` and `src/modules/orders/tests/integration/schema-contract.test.ts` are graph neighbors. The file content shows no direct interaction with them.

## Notes
- There is no "no rate" state. Absent or unrecognized input falls back to the standard rate, so an order line always freezes a real number.
- Rate values come from config functions, called on each resolution. Nothing is hardcoded except the zero rate.
