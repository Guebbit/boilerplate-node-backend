---
source: src/modules/shop/config.ts
sha256: 88da000e9370e77c5f036a3e6e00ee77c8b37ab9030569d7d98650ab4706a98b
generated_at: 2026-11-08T08:20:09.765440+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop/config.ts

## Purpose

Defines the shop module's runtime configuration slice — timezone, return-shipper address, permitted shipping countries, default currency, and who pays return postage. Values are resolved per call (not captured at import) so tests can vary them per case. A deployment changes a value by restarting the process.

## Key elements

- **`shopConfig`** (export) — The `defineConfig` object for the `shop` slice. Declares the shape (all `NODE_SHOP_*` and `NODE_RETURN_*` fields), attaches the boot `check`, and registers the slice name `'shop'`.
- **`phoneCheck`** (internal) — Boot-time validator. Returns a refusal array if `NODE_LEGAL_PHONE` is missing or blank. The phone itself is *not* declared in this shape; it is owned by `account` and merely required here.
- **Shape fields** — `NODE_SHOP_TIMEZONE`, `NODE_RETURN_ADDRESS_*` (name/street/city/zip/country), `NODE_RETURN_POSTAGE_PAYER` (choice, default `'consumer'`), `NODE_SHIP_TO_COUNTRIES`, `NODE_DEFAULT_CURRENCY` (default `'EUR'`).

## Relationships

- **`src/infrastructure/config/define.ts`** — Provides `defineConfig`, the factory that produces `shopConfig`.
- **`src/infrastructure/config/fields.ts`** — Supplies the field-type constructors (`timeZone`, `text`, `country`, `countries`, `currency`, `choice`) used to declare the shape.
- **`src/infrastructure/config/store.ts`** — Source of the `Environment` type that `phoneCheck` receives as its second argument.
- **`src/types/index.ts`** — Exports `ReturnPostagePayer`, whose values seed the `NODE_RETURN_POSTAGE_PAYER` choice field.
- **`src/modules/shop/module.ts`** / **`src/modules/shop/service.ts`** — Same-module consumers that read the resolved values from this config at call time.

## Notes

- `NODE_LEGAL_PHONE` is **not** in this shape. `phoneCheck` reads it from the `Environment` object passed at boot, but the field is declared (or absent) under `account`. The shop only *requires* it.
- The file header explicitly lists what is **not** here: bank-transfer details (owned by `payments`) and VAT rates (resolved by `products`, frozen by `orders`).
- Legal basis for the mandatory phone: CRD Art. 6(1)(c), Directive 2011/83/EU (as amended by 2019/2161).
- `NODE_DEFAULT_CURRENCY` defaults to `'EUR'`; `NODE_RETURN_POSTAGE_PAYER` defaults to `'consumer'`. All other address fields are optional text/country inputs.
