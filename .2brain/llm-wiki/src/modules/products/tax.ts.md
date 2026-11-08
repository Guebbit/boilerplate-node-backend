---
source: src/modules/products/tax.ts
sha256: 194cfbfb0e026e3def117da2dfe7f550ccf6bbd7ad00e588e060ae4e15596426
generated_at: 2026-11-08T07:49:21.879330+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tax.ts

## Purpose

Resolves a product's `taxClass` into the concrete decimal VAT rate the shop will charge. It lives in the catalogue module (not `orders`) because "every product resolves to a rate" is a catalogue invariant; `orders` merely freezes the already-resolved number onto an order line.

## Key elements

- **`TaxClass`** (type) — `NonNullable<Product['taxClass']>`. The set of valid tax-class values a product can hold.
- **`RateType`** (type) — `NonNullable<Product['rateType']>`. Exported for consumers (e.g. invoice rendering) but **not resolved here**; it is passed through verbatim onto an order line.
- **`resolveTaxRate(taxClass?: TaxClass): number`** — Returns the decimal rate: `0` for `'zero'`, `vatRateReduced()` for `'reduced'`, and `vatRateDefault()` for anything else (including `undefined`). Always returns a concrete number; there is no `null`/`undefined` return path.

## Relationships

- **`src/modules/products/config.ts`** — Direct dependency. Provides `vatRateDefault()` and `vatRateReduced()`, the two configurable rate values this module maps to.
- **`src/types/index.ts`** — Direct dependency. Supplies the `Product` type, from which `TaxClass` and `RateType` are derived via `NonNullable`.
- **`src/modules/orders/services/snapshot.ts`** — Downstream consumer. Freezes the output of `resolveTaxRate` and the raw `RateType` onto an order line; invoices read both straight off that snapshot.
- **`src/modules/products/index.ts`** — Re-exports this module's public API (`TaxClass`, `RateType`, `resolveTaxRate`) to the rest of the catalogue package.
- **`src/modules/products/tests/unit/tax.test.ts`** — Unit tests for `resolveTaxRate`.
- **`src/modules/orders/tests/factories.ts`** / **`src/modules/orders/tests/integration/schema-contract.test.ts`** — Order-side tests that exercise the frozen rate and `RateType` produced by this module.

## Notes

- `resolveTaxRate` has **no fall-through "no rate" branch**. An unrecognized or absent `taxClass` silently maps to `vatRateDefault()`, guaranteeing the return type is always `number` (not `number | undefined`). This is intentional so order lines can freeze a real number.
- `RateType` is exported but deliberately **not resolved** in this file. It is a pass-through value whose semantics are defined by the contract/invoice layer, not by catalogue logic.
- The rate values (`vatRateDefault`, `vatRateReduced`) are **functions**, not constants, implying they may read from environment or runtime configuration.
