---
source: src/modules/products/tests/unit/product-page-path.test.ts
sha256: 4a77041edb006d25c2826d9e14daa7c40296d1822e7e775f739baa888b04d478
generated_at: 2026-10-29T05:34:47.651074+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/product-page-path.test.ts

## Purpose

Unit tests for `productPagePath`, the single function that produces a product's URL path. Because both the sitemap generator and the back-in-stock email read this path, the tests lock down its template-filling, environment-override, and encoding behavior to prevent silent breakage across those two consumers.

## Key elements

- **`describe('productPagePath')`** — three `it` blocks:
  - *default template*: asserts `productPagePath('65f0abc')` → `'products/65f0abc'`.
  - *env override*: uses `withEnvironmentOverrides` to set `NODE_FRONTEND_LINK_PRODUCT` to `'shop/item-{id}'` and asserts the output follows it.
  - *encoding & `$&` safety*: asserts that a pathologically crafted id (`'a/b$&c'`) is URL-encoded and that `$&` is emitted as literal text (`%24%26`), not interpreted as a regex replacement token.

## Relationships

- **`src/modules/products/config.ts`** — exports `productPagePath`, the function under test. This file is the sole consumer of that export in the test suite.
- **`tests/support/environment.ts`** — provides `withEnvironmentOverrides`, a helper that temporarily swaps `process.env` values for the duration of a callback (must be awaited / return a Promise).

## Notes

- `withEnvironmentOverrides` requires the callback to return a **Promise** (even `Promise.resolve()`). Forgetting this causes a silent test failure or hang.
- The `$&` test guards against a real bug class: if `productPagePath` used `String.prototype.replace` with a string pattern, `$&` in the id would be expanded to the matched substring. The test confirms the implementation avoids that pitfall.
- The `{id}` placeholder in the env var is the only documented substitution token; there is no evidence of other named slots.
