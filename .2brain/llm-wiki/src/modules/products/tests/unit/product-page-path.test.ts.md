---
source: src/modules/products/tests/unit/product-page-path.test.ts
sha256: 4a77041edb006d25c2826d9e14daa7c40296d1822e7e775f739baa888b04d478
generated_at: 2026-11-08T07:54:15.374409+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/product-page-path.test.ts

## Purpose

Unit tests for `productPagePath`, the single source of truth for a product's URL slug. This file exists to lock down that the function correctly substitutes the product id into the path template, respects the `NODE_FRONTEND_LINK_PRODUCT` environment override, and safely encodes the id (treating `$&` as literal text rather than a regex substitution token).

## Key elements

- **`describe('productPagePath')`** — top-level suite covering three behaviors:
  - *fills the id into the default template* — asserts the default `products/{id}` shape.
  - *follows NODE_FRONTEND_LINK_PRODUCT* — uses `withEnvironmentOverrides` to set a custom template (`shop/item-{id}`) and verifies substitution.
  - *encodes an id, and reads `$&` in it as text* — confirms the id is URL-encoded and that `$&` is not interpreted as a special regex replacement character.

## Relationships

- **`src/modules/products/config.ts`** — source of the `productPagePath` function under test. The test imports it directly (`../../config`).
- **`tests/support/environment.ts`** — provides `withEnvironmentOverrides`, a helper that temporarily sets process env vars for the duration of the callback. Used here to simulate `NODE_FRONTEND_LINK_PRODUCT`.

## Notes

- The `{id}` placeholder in the template is a simple string replacement, **not** a regex `String.replace`. The third test exists specifically to guard against a naive `.replace('{id}', id)` implementation, which would interpret `$&` in the id as "the matched substring."
- `withEnvironmentOverrides` returns a `Promise` (the test returns `Promise.resolve()`), so the env restoration is async-safe even if the callback throws.
- The file's JSDoc block states this path is consumed by **both** the sitemap generator and the back-in-stock email — a change to the template therefore has two downstream effects.
