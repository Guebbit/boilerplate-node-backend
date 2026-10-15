---
source: src/modules/products/config.ts
sha256: 7d959eb13699370812de68f3bbe569c6eb03740dce86f99db8dd607cb5c9d442
generated_at: 2026-10-15T11:39:47.096973+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/config.ts

## Purpose

Defines the products module's runtime configuration — the two VAT rates (default and reduced) — and re-exposes two infrastructure-level values (currency, low-stock threshold) under product-domain names. Rates are read per call (not captured at import) so individual tests can vary them, following the same pattern as `inventory/config.ts`.

## Key elements

- **`productsConfig`** — `defineConfig` object declaring `NODE_VAT_RATE_DEFAULT` (default `0.22`) and `NODE_VAT_RATE_REDUCED` (default `0.1`), both as required `decimal` fields constrained to `[0, 1)`.
- **`vatRateDefault()`** — returns the default VAT rate as a number; applied to products with no `taxClass`.
- **`vatRateReduced()`** — returns the reduced VAT rate as a number; applied when `taxClass` is `reduced`.
- **`productCurrency()`** — returns the deployment's ISO-4217 currency code (delegates to `currencyConfig`).
- **`lowStockThreshold()`** — returns the stock count at-or-below which a product is flagged low (delegates to `stockConfig`).

## Relationships

- **Imports from `src/infrastructure/config/define.ts`** — uses `defineConfig` to declare the shape.
- **Imports from `src/infrastructure/config/fields.ts`** — uses `decimal` for field validation.
- **Imports from `src/infrastructure/runtime/config.ts`** — pulls `currencyConfig` and `stockConfig` for the two re-exported getters.
- **`src/modules/products/tax.ts`** — the sole consumer of `vatRateDefault` / `vatRateReduced`; resolves a product's tax class to a concrete rate.
- **`src/modules/products/tests/unit/config.test.ts`** — exercises the per-call rate pattern and validation bounds.

## Notes

- The two VAT getters are the only place a tax rate is *read*; `orders` merely freezes whatever `tax.ts` returns onto a line item and never queries a rate itself.
- Defaults (`0.22`, `0.1`) apply in `NODE_ENV=test`. In any real deployment (including the demo profile) both rates must be set explicitly at boot; the `required` flag enforces this.
- A rate of `1` or above is rejected at validation — it is treated as a certain typo.
- `productCurrency` and `lowStockThreshold` are not products-specific config; they are pass-throughs to shared infrastructure config so that callers within the products module (e.g. `presenter.ts`) use a domain-scoped name.
