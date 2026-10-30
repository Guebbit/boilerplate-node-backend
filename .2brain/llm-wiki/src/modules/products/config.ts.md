---
source: src/modules/products/config.ts
sha256: ecfae3a000f7a3b49c1a9a92f75e4031cf34a89fa6f85c40d664d955c7ff484a
generated_at: 2026-10-29T05:24:38.754281+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/config.ts

## Purpose

Defines the products module's deployment configuration — the two VAT rates and the product-page URL template — using a lazy-read pattern (call-site accessors rather than captured-at-import values) so tests can vary a rate per case. A rate change reaches production only on restart, like every environment variable.

## Key elements

- **`productsConfig`** — `defineConfig` object (`name: 'products'`) with three fields: `NODE_VAT_RATE_DEFAULT` (decimal, `[0, 1)`, default `0.22`), `NODE_VAT_RATE_REDUCED` (decimal, `[0, 1)`, default `0.1`), and `NODE_FRONTEND_LINK_PRODUCT` (text, defaults from `FRONTEND_LINK_RULES.links.product`).
- **`vatRateDefault(): number`** — Returns the default VAT rate. The sole reader is `resolveTaxRate` in `./tax`; `orders` freezes whatever that returns onto a line and never reads a rate itself.
- **`vatRateReduced(): number`** — Returns the reduced-rate (books, food, medicine, etc.) VAT rate.
- **`lowStockThreshold(): number`** — Re-exposes `stockConfig().NODE_LOW_STOCK_THRESHOLD` so the storefront badge and the stock board share one threshold.
- **`productPagePath(id: string): string`** — Fills `{id}` into the `NODE_FRONTEND_LINK_PRODUCT` template with `encodeURIComponent`, producing e.g. `products/65f0`. Used by the sitemap and the back-in-stock notification.

## Relationships

- **`src/infrastructure/config/define.ts`** — Provides `defineConfig`, the validation/bootstrap wrapper for `productsConfig`.
- **`src/infrastructure/config/fields.ts`** — Provides the `decimal` and `text` field constructors used in the shape.
- **`src/infrastructure/http/frontend-link.ts`** — Source of the default `FRONTEND_LINK_RULES.links.product` template.
- **`src/infrastructure/runtime/config.ts`** — Source of `stockConfig`, re-exposed as `lowStockThreshold`.
- **`src/modules/products/tax.ts`** — Sole consumer of `vatRateDefault` / `vatRateReduced`.
- **`src/modules/products/index.ts` / `module.ts`** — Module barrel and registration; re-export or wire the config into the products module.
- **`src/modules/products/presenter.ts`** — Likely reads `lowStockThreshold` for the low-stock badge.
- **`src/modules/sitemap/service.ts`** — Calls `productPagePath` to generate product URLs.
- **`src/modules/stock-alerts/service.ts`** — Calls `productPagePath` in back-in-stock emails.
- **`src/modules/products/tests/unit/config.test.ts`** — Unit tests for the rate accessors and validation bounds.
- **`src/modules/products/tests/unit/product-page-path.test.ts`** — Unit tests for template substitution and encoding.

## Notes

- Rates are **read per call**, not captured at import. A test can vary a rate per case without re-importing; a production rate change requires a process restart.
- Valid range is `[0, 1)`. A value of `1` (100 %) or higher is rejected as a probable typo.
- The defaults (`0.22`, `0.1`) apply only under `NODE_ENV=test`. The demo profile (and every real deployment) must set both rates explicitly.
- `productPagePath` uses a **function replacer** in `replaceAll` so a literal `$&` inside an id is treated as text rather than a `String.replace` pattern.
- `lowStockThreshold` is not a products-specific setting; it is a passthrough to the shared `stockConfig` so the storefront badge and the stock board always agree.
