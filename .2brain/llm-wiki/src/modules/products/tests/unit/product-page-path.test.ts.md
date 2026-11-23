---
source: src/modules/products/tests/unit/product-page-path.test.ts
source_sha256: 4a77041edb006d25c2826d9e14daa7c40296d1822e7e775f739baa888b04d478
context_sha256: 6d4eac1ed787cc716c220a06ba8de4a07ee71020df949cac8cd1b850d441814c
generated_at: 2026-11-22T07:19:23.945090+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/unit/product-page-path.test.ts

## Purpose
Unit tests for `productPagePath`, the function that builds the path of a product's page. Per the file's header comment, this is the single setting that both the sitemap and the back-in-stock mail read, so these tests pin its behavior.

## Key elements
- **`productPagePath` describe block**: three tests:
  - Default template: `productPagePath('65f0abc')` returns `products/65f0abc`.
  - Environment override: with `NODE_FRONTEND_LINK_PRODUCT` set to `shop/item-{id}`, the result is `shop/item-65f0abc`. The override runs inside `withEnvironmentOverrides`, and the callback returns `Promise.resolve()`.
  - Encoding: `productPagePath('a/b$&c')` returns `products/a%2Fb%24%26c`. The id is URL-encoded, and `$&` is treated as literal text rather than as a replacement pattern.

## Relationships
- Imports `productPagePath` from `src/modules/products/config.ts` (via `../../config`), which is the code under test.
- Imports `withEnvironmentOverrides` from `@tests/environment`, which maps to `tests/support/environment.ts`. It temporarily sets environment variables such as `NODE_FRONTEND_LINK_PRODUCT` for the duration of a callback.

## Notes
- The `$&` test indicates that the `{id}` substitution must not use special replacement patterns. The test does not show how `config.ts` implements this.
- The override test returns a promise from `withEnvironmentOverrides`, so the helper appears to take a callback that returns a promise.
