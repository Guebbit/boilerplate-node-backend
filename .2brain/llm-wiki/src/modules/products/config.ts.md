---
source: src/modules/products/config.ts
source_sha256: 9c56a52f2c0c6703b8807dc8d9e722a5d92af9b9fdc97f8dad0b737c1184f8a9
context_sha256: 534a40b6aa423feb6078bafd9b10eda01617730b4f56a4ad53967867f64cfe23
generated_at: 2026-11-22T07:07:34.289709+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/config.ts

## Purpose

Defines the `products` module's runtime configuration: the two VAT rates a deployment charges and the path template for a product page on the paired frontend. Values are read per call rather than captured at import (the same pattern as `src/modules/inventory/config.ts`), so tests can vary a rate per case. The file lives in `products` because `resolveTaxRate` in `./tax` is the only reader of the rates; `orders` freezes whatever that returns onto a line and never reads a rate itself.

## Key elements

- **`productsConfig`**: the `defineConfig({ name: 'products', shape })` accessor, with three environment variables:
  - `NODE_VAT_RATE_DEFAULT`: a decimal, default `0.22`, valid in `[0, 1)`, required at boot.
  - `NODE_VAT_RATE_REDUCED`: a decimal, default `0.1`, valid in `[0, 1)`, required at boot.
  - `NODE_FRONTEND_LINK_PRODUCT`: text, default `FRONTEND_LINK_RULES.links.product`. `{id}` is replaced by the product id.
- **`vatRateDefault()`**: returns the rate for a product with no `taxClass`, which is every product's fallback.
- **`vatRateReduced()`**: returns the rate for a product whose `taxClass` is `reduced`.
- **`productPagePath(id)`**: fills `{id}` in the product-link template with the URL-encoded id and returns the path under the language segment (e.g. `products/65f0`).

## Relationships

- Uses `defineConfig` from `src/infrastructure/config/define.ts` and the `decimal` and `text` field builders from `src/infrastructure/config/fields.ts`.
- Takes the default product link template from `FRONTEND_LINK_RULES` in `src/infrastructure/http/frontend-link.ts`.
- `src/modules/products/tax.ts` reads the VAT rates through `resolveTaxRate`.
- `src/modules/sitemap/service.ts` and `src/modules/stock-alerts/service.ts` use the product page path (the sitemap and the back-in-stock mail), so one setting moves both.
- `src/modules/products/index.ts` and `src/modules/products/module.ts` sit next to it in the module.
- `src/modules/products/tests/unit/config.test.ts` and `src/modules/products/tests/unit/product-page-path.test.ts` cover this file.

## Notes

- A rate of 1 (100%) or more is treated as a typo and rejected.
- Both rates are required at boot. The defaults apply only under `NODE_ENV=test`, which skips that check. The demo profile does not skip it and sets both rates itself.
- A rate change reaches production only with a restart, like any environment variable.
- `productPagePath` passes a function replacer to `replaceAll`, so a `$&` in an id is treated as text rather than a replacement pattern.
