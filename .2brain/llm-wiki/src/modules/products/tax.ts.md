---
source: src/modules/products/tax.ts
sha256: ecbbe116b56439f50a1e4669dd11f8155848d1de3f24f78ee716928d0a86d519
generated_at: 2026-09-23T19:28:46.433810+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tax.ts

## Purpose

Resolves a product's `taxClass` into the concrete decimal VAT rate it is charged. It lives in the products module (not orders) because "every product resolves to a rate" is a catalogue invariant; orders merely freeze whatever this function returns.

## Key elements

- **`TaxClass`** (type export) — `NonNullable<Product['taxClass']>`; the set of values a product's tax class may hold.
- **`resolveTaxRate(taxClass?)`** (function export) — Maps a `TaxClass` to a decimal rate:
  - `'zero'` → `0`
  - `'reduced'` → `vatRateReduced()`
  - `undefined` or any other value → `vatRateDefault()`
  - Always returns a `number` (never `null`/`undefined`).

## Relationships

- **`src/modules/products/config.ts`** — Provides the `vatRateDefault()` and `vatRateReduced()` functions that supply the actual rate values.
- **`src/types/index.ts`** — Source of the `Product` type, from which `TaxClass` is derived.
- **`src/modules/orders/services/snapshot.ts`** — Downstream consumer; freezes the resolved rate onto an order line.
- **`src/modules/products/index.ts`** — Module barrel; re-exports this file for external consumers.
- **`src/modules/products/tests/unit/tax.test.ts`** — Unit tests for `resolveTaxRate`.

## Notes

- There is intentionally **no "no rate" state**. An absent or unrecognized tax class always falls back to the shop default, guaranteeing that downstream code (e.g. order snapshots) receives a concrete number rather than an optional one.
- The function is a pure, synchronous mapping with no side effects.
- The doc comment explicitly justifies the module placement: this is a catalogue concern, not an order concern.
