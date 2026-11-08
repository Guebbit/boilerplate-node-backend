---
source: src/modules/products/config.ts
sha256: ecfae3a000f7a3b49c1a9a92f75e4031cf34a89fa6f85c40d664d955c7ff484a
generated_at: 2026-11-08T07:42:02.244472+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/config.ts

## Purpose

Defines the products domain's runtime configuration — two VAT rates and the product-page URL template — and exposes thin accessor functions so callers read values per call rather than at import time. This lets tests vary a rate per case without re-importing. The file lives under `products` because `resolveTaxRate` (`./tax`) is the sole reader of the rates; `orders` never reads a rate directly, it just freezes whatever the catalogue resolves onto a line item.

## Key elements

- **`productsConfig`** — the `defineConfig` instance holding three shape entries: `NODE_VAT_RATE_DEFAULT` (decimal, 0–1), `NODE_VAT_RATE_REDUCED` (decimal, 0–1), and `NODE_FRONTEND_LINK_PRODUCT` (text template with a `{id}` placeholder).
- **`vatRateDefault()`** — returns the default VAT rate (e.g. 0.22). Applied to products with no `taxClass`.
- **`vatRateReduced()`** — returns the reduced VAT rate (e.g. 0.1). Applied to products whose `taxClass` is `reduced`.
- **`lowStockThreshold()`** — delegates to `stockConfig().NODE_LOW_STOCK_THRESHOLD`; the count at/below which a product is flagged low-stock. Not stored in `productsConfig` itself.
- **`productPagePath(id)`** — fills the `{id}` placeholder in `NODE_FRONTEND_LINK_PRODUCT` with a URL-encoded product id. Uses a function replacer so `$&` in an id is treated as literal text.

## Relationships

- **`@infrastructure/config/define`** / **`@infrastructure/config/fields`** — `defineConfig`, `decimal`, and `text` are the building blocks for the shape definition.
- **`@infrastructure/http/frontend-link`** — supplies `FRONTEND_LINK_RULES.links.product` as the default template for `NODE_FRONTEND_LINK_PRODUCT`.
- **`@infrastructure/runtime/config`** — source of `stockConfig`, from which `lowStockThreshold()` reads. The threshold is shared with `inventory` so the storefront badge and stock board stay in agreement.
- **`./tax`** — the only in-module consumer of `vatRateDefault` and `vatRateReduced`.
- **`./presenter`** — consumes `productPagePath` to render links in product responses.
- **`src/modules/sitemap/service.ts`** — calls `productPagePath` to build sitemap URLs.
- **`src/modules/stock-alerts/service.ts`** — calls `productPagePath` for the product link in back-in-stock emails.
- **Tests** — `config.test.ts` exercises the rate accessors; `product-page-path.test.ts` exercises the template substitution and encoding.

## Notes

- All accessors are **functions**, not constants. Call them at the point of use; do not capture the result at module top-level.
- `lowStockThreshold` is *not* part of `productsConfig`; it borrows from `stockConfig` in infrastructure. If you add a new threshold, decide whether it belongs in `stockConfig` or here based on whether `inventory` also reads it.
- Rate validity is constrained to `[0, 1)`. A value of 1 or above will fail validation at boot (skipped only in `NODE_ENV=test`).
- `productPagePath` URL-encodes the id. If you change the template to include additional placeholders, follow the same function-replacer pattern to avoid `$`-pattern surprises.
- The `default` values on `decimal`/`text` fields apply in the test environment; production and the demo profile must set the env vars explicitly.
