---
source: src/modules/cart/tests/unit/domain-rules.test.ts
sha256: a8e03f174dd758f6acd1c19a32ba1af73cd8547567d73e302dd4d6a8c6e9c71f
generated_at: 2026-11-08T05:24:19.189504+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/domain-rules.test.ts

## Purpose

Pure unit tests for the cart domain rules (`evaluateCheckout`, `basketWeight`, `evaluateShippingRequirement`). No mocks or database — the functions are exercised with hand-built `CartLineCandidate` objects. The verdict-to-HTTP-status mapping is intentionally excluded and lives in `service.test.ts`.

## Key elements

- **`line(quantity, available?)`** – helper that builds a `CartLineCandidate`; `available` is pre-resolved (the way a caller would inject it from `@modules/products`).
- **`preorder(quantity, available)`** – helper for preorder lines where `available` means remaining allowance, not shelf stock.
- **`shipped(requiresShipping?)`** – helper for `evaluateShippingRequirement` tests; defaults to a physical product.
- **`describe('evaluateCheckout')`** – covers empty-cart refusal, valid carts, preorder allowance, deleted/hidden/soft-deleted products, insufficient-stock shortfalls (including `out_of_stock` vs `insufficient_stock` vs `unavailable`), off-sale, reserved units, missing `available`, and priority ordering (resolution before stock).
- **`describe('basketWeight')`** – verifies weight × quantity summation, zero for missing weight or empty basket.
- **`describe('evaluateShippingRequirement')`** – verifies digital-only bypass, `method-required`, `address-required`, and acceptance paths for physical baskets.

## Relationships

- **`src/modules/cart/domain/rules.ts`** — sole import source. The test file imports `evaluateCheckout`, `basketWeight`, `evaluateShippingRequirement`, and the `CartLineCandidate` type. All assertions are against the shape of those functions' return values.

## Notes

- A `null` product (hard-deleted, catalogue join miss) is distinct from `undefined` (join simply didn't attach one); both map to `product-unavailable` but the test documents that `null` is the *real* production case.
- A hidden (`active: false`) or soft-deleted product still joins the catalogue and therefore *can* carry a title in the refusal — the test pins this because it's non-obvious that the join is unscoped.
- Missing `available` (key absent) is treated as "nothing to sell," not "unconstrained." This is a deliberate fail-closed convention.
- Off-sale (`purchasable: false`) is reported under `insufficient-stock` with `availability: 'unavailable'`, while hidden + off-sale escalates to `product-unavailable` (the 404-shaped refusal).
- Preorder `available` is the remaining allowance, not warehouse stock — do not conflate with the regular `line` helper's meaning.
