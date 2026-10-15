---
source: src/modules/products/tax.ts
sha256: 194cfbfb0e026e3def117da2dfe7f550ccf6bbd7ad00e588e060ae4e15596426
generated_at: 2026-10-15T11:46:23.253775+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tax.ts

## Purpose

Resolves a product's `taxClass` into the concrete decimal VAT rate that will be charged. It lives in the catalogue module (not in `orders`) because "every product resolves to a rate" is a catalogue invariant; orders simply freeze whatever value this file returns.

## Key elements

- **`TaxClass`** — type alias for `NonNullable<Product['taxClass']>`; the set of values a product's tax class can hold.
- **`RateType`** — type alias for `NonNullable<Product['rateType']>`; intentionally *not* resolved anywhere. It is carried verbatim onto an order line as a frozen attribute for invoice display.
- **`resolveTaxRate(taxClass?)`** — the only runtime function. Maps `'zero'` → `0`, `'reduced'` → `vatRateReduced()`, and everything else (including `undefined`) → `vatRateDefault()`. Always returns a concrete `number`; there is no `null`/`undefined` branch.

## Relationships

- **`src/modules/products/config.ts`** — provides `vatRateDefault` and `vatRateReduced`, the actual rate values this module returns.
- **`src/types/index.ts`** — source of the `Product` type from which both exported type aliases are derived.
- **`src/modules/products/index.ts`** — barrel file; re-exports this module's public surface (`TaxClass`, `RateType`, `resolveTaxRate`).
- **`src/modules/orders/services/snapshot.ts`** — downstream consumer: freezes the output of `resolveTaxRate` (and the raw `RateType`) onto an order line. Does not re-resolve.
- **`src/modules/orders/tests/factories.ts`** / **`schema-contract.test.ts`** — exercise the frozen rate value through the order schema.
- **`src/modules/products/tests/unit/tax.test.ts`** — unit tests for `resolveTaxRate` and the type exports.

## Notes

- There is deliberately **no "no rate" state**. An absent or unrecognized `taxClass` falls through to `vatRateDefault()`, guaranteeing callers always get a real number. This is what lets order lines store a non-optional `number` instead of `number | undefined`.
- `RateType` is exported purely as a *type passthrough*. No function in this file ever reads or transforms it; `snapshot.ts` copies it onto the order line as-is for invoice rendering.
- Rate values (`vatRateDefault`, `vatRateReduced`) are called as **functions** from `config.ts`, not plain constants — they may be environment-dependent at call time.
