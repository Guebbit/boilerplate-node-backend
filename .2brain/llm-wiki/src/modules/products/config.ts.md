---
source: src/modules/products/config.ts
sha256: 4598562bf3150fedb9e637f59b391af8763a85322532d83edca14cd1a97083b7
generated_at: 2026-09-27T15:30:30.576468+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/config.ts

## Purpose

Defines the two VAT rates (default and reduced) and the deployment's single currency code for the products module. All values are read per call via environment variables rather than captured at import, so a rate change takes effect on the next resolve without a restart. This file owns those reads because `products/tax.ts` is the sole consumer of a product's tax class → rate mapping.

## Key elements

- **`vatRateDefault()`** — Returns the shop's default VAT rate (`NODE_VAT_RATE_DEFAULT`, fallback `0.22`). Used for products with no `taxClass`.
- **`vatRateReduced()`** — Returns the reduced-rate VAT (`NODE_VAT_RATE_REDUCED`, fallback `0.1`). Applied to products with `taxClass: 'reduced'`.
- **`invalidVatRateConfig()`** — Boot-time `customCheck`; returns an array of env-var names that are *set* but don't parse as a decimal in `[0, 1)`. Complements the manifest's empty-string check by catching malformed values like `2.2` or `abc`.
- **`productCurrency()`** — Returns the deployment's ISO-4217 code (`NODE_DEFAULT_CURRENCY`, fallback `'EUR'`).
- **`isValidVatRate`** (internal) — Validates a raw env string through `parseEnvironmentDecimal` and the `[0, 1)` range.

## Relationships

- **`src/infrastructure/runtime/environment.ts`** — Imports `environmentDecimal` (rate readers) and `parseEnvironmentDecimal` (validation). All numeric env reads go through these helpers.
- **`src/modules/products/tax.ts`** — `resolveTaxRate` is the sole runtime consumer of `vatRateDefault` / `vatRateReduced`.
- **`src/modules/products/module.ts`** — Registers `invalidVatRateConfig` as the module's `customCheck` for boot validation.
- **`src/modules/products/tests/unit/config.test.ts`** — Unit-tests the rate readers, validator, and currency accessor.

## Notes

- Reads are intentionally per-call (the `inventory/config.ts` pattern). Do not "optimise" this into a module-level constant — that would require a restart to pick up rate changes.
- Validation and reading must stay on the same parser (`parseEnvironmentDecimal`). A looser check (e.g. bare `Number(raw)`) would accept strings the reader treats as unset, silently falling back to the default rate.
- `productCurrency` reads the *same* env var as `orders`'s `shopCurrency` but lives here to avoid a `products → orders → products` cycle that `.dependency-cruiser.modules.cjs` rejects. Both readers share the same default (`'EUR'`), so a deployment sets the variable once.
- The range check is `[0, 1)`: a value of `1` (100 %) is treated as a typo, not a valid rate.
- `NODE_ENV=test` and the demo profile skip the `invalidVatRateConfig` gate entirely; the fallback defaults still apply.
