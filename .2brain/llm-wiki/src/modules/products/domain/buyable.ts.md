---
source: src/modules/products/domain/buyable.ts
sha256: 268db930cc87901abe80544735b57b4ced54bb8a8c2d9e81b876be2f19d36ddc
generated_at: 2026-11-08T07:43:31.790516+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/domain/buyable.ts

## Purpose

Encapsulates the single "can this product be ordered right now?" rule as a pure function (clock injected via argument). It combines the product's active/purchasable flags with preorder allowance, available stock, and backorder state into one boolean, and also exposes a transition helper for detecting the *flip* from not-buyable to buyable (used by the back-in-stock signal).

## Key elements

- **`BuyableFacts`** – interface extending `BackorderFacts` with optional `onHand` and `reserved` counters; the minimal shape the rule reads off a product.
- **`isBuyable(facts, now)`** – returns `false` if the product is inactive or not purchasable; otherwise checks preorder allowance, available stock, or open backorder (in that priority order).
- **`becameBuyable(before, after, now)`** – `true` only on the `false → true` transition; used to trigger a "back in stock" notification.

## Relationships

- **`./backorder`** – imports `isBackorder` and the `BackorderFacts` type (which `BuyableFacts` extends).
- **`./preorder`** – imports `isPreorder` to short-circuit into the allowance check.
- **`./stock`** – imports `availableStock` and `preorderAllowanceLeft` for the numeric comparisons.
- **`./index.ts`** – barrel file for the products domain; re-exports this module's public API.
- **`tests/unit/buyable.test.ts`** – unit tests for `isBuyable` and `becameBuyable`.
- **`modules/stock-alerts/service.ts`** – consumes `becameBuyable` to fire the back-in-stock notification when the rule flips.

## Notes

- The function is deliberately **pure**: no `Date.now()` call; `now` is always a parameter, making it trivially testable and safe for replay.
- Priority order matters: preorder allowance is checked *before* stock/backorder. A product in its preorder window is only buyable if allowance remains, even if `onHand > reserved`.
- `becameBuyable` evaluates both snapshots at the *same* `now`; it is not a historical check.
