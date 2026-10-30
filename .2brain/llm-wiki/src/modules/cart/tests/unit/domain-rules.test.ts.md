---
source: src/modules/cart/tests/unit/domain-rules.test.ts
sha256: a8e03f174dd758f6acd1c19a32ba1af73cd8547567d73e302dd4d6a8c6e9c71f
generated_at: 2026-10-29T03:30:36.533836+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/domain-rules.test.ts

## Purpose
Unit tests for the three pure domain-rule functions in the cart module — `evaluateCheckout`, `basketWeight`, and `evaluateShippingRequirement`. No mocks, no database; the tests exercise the rules exactly as a caller would invoke them, with pre-resolved product data. The verdict-to-HTTP-status mapping is intentionally excluded (covered in `service.test.ts`).

## Key elements
- **`line(quantity, available?)`** — Helper that builds a `CartLineCandidate` with an optional pre-resolved `available` count. Omitting `available` simulates an unknown count (tests the "absent → refuse" path).
- **`preorder(quantity, available)`** — Builds a candidate representing a preorder line; `available` is the remaining allowance, not shelf stock.
- **`shipped(requiresShipping?)`** — Builds a minimal joined line for the shipping-requirement tests; defaults to physical.
- **`describe('evaluateCheckout')`** — Covers: empty cart, stock sufficiency/shortfalls, preorder allowance, deleted/inactive/soft-deleted/off-sale/sold-out products, reserved-units case, absent `available` count, and priority ordering (unresolved product outranks stock shortfall).
- **`describe('basketWeight')`** — Verifies weight summation, missing-weight → 0, and empty-basket → 0.
- **`describe('evaluateShippingRequirement')** — Covers digital-only baskets, physical baskets missing a method, address requirement gating, and the "any one physical line triggers the rule" case.

## Relationships
- **`src/modules/cart/domain/rules.ts`** — Sole import target. This file tests `evaluateCheckout`, `basketWeight`, `evaluateShippingRequirement`, and the `CartLineCandidate` type exactly as they are exported from that module. No other dependencies.

## Notes
- `available` on a candidate is **already resolved** by the caller (via `@modules/products`'s `availableStock`); the rule itself does not fetch stock. Tests pass it in directly.
- A missing `available` field is treated as **refuse** (0 sellable), not as unconstrained. This is a deliberate safety default called out in a comment.
- The catalogue join is unscoped: inactive and soft-deleted products still join and can be *named* in refusals (`product-unavailable` with a title), unlike hard-deleted ones (title is `undefined`).
- `availability` in shortfalls distinguishes `out_of_stock` (zero left) from `insufficient_stock` (some left, not enough) from `unavailable` (off-sale), so the client can word the error differently.
- "Hidden" (`active: false`) takes priority over "off-sale" (`purchasable: false`) — the line is reported as `product-unavailable` (404-shaped), not `insufficient-stock`.
- The reservation model means `available` can be 0 even when warehouse stock exists; tests explicitly cover this ("units all promised" case).
