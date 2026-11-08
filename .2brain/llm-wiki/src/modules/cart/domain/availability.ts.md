---
source: src/modules/cart/domain/availability.ts
sha256: ee0294b43e5e1167c4a0c5a622c8117121e993bd0b8f3c7e46fa7031d31be86c
generated_at: 2026-11-08T05:12:59.756360+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/availability.ts

## Purpose

Defines the single precedence rule that assigns a `LineAvailability` state to a cart, wishlist, or merge-result line. It is a pure domain function: given a joined product and the ledger's unit counts, it returns exactly one of seven states in a fixed order. No side effects, no I/O.

## Key elements

- **`AvailabilityProduct`** – Narrow interface for the product fields the rule actually reads (`active`, `purchasable`, `deletedAt`, `preorder`, `backorder`). Decouples the rule from the full product entity.
- **`AvailabilityFacts`** – Input shape: the product (or `null`), the ledger's `available` units, the `shelf` units (backorder only), and the line's `quantity` (absent for wishlist lines).
- **`lineAvailability(facts)`** – The core rule. First-match-wins cascade: `removed` → `unavailable` → `out_of_stock` → `insufficient_stock` → `preorder` → `backorder` → `in_stock`.
- **`isBuyable(availability)`** – Type guard returning `true` for `in_stock`, `preorder`, `backorder`. Used by checkout to decide whether to accept or refuse a line.

## Relationships

- **`src/types/index.ts`** – Provides the `LineAvailability` union type used as the return type of `lineAvailability` and the parameter of `isBuyable`.
- **`src/modules/cart/domain/stock.ts`** – Supplies `fitsStock(quantity, available)`, which `lineAvailability` calls for the `insufficient_stock` check.
- **`src/modules/cart/domain/index.ts`** – Domain barrel; expected re-export point for `lineAvailability` and `isBuyable`.
- **`src/modules/cart/tests/unit/line-availability.test.ts`** – Unit tests exercising the precedence cascade and edge cases (wishlist lines, zero-allowance preorders, empty-shelf backorders).
- **`src/modules/cart/presenter.ts`**, **`services/preorder.ts`**, **`services/shelf.ts`**, **`services/view.ts`**, **`domain/rules.ts`** – Downstream consumers in the cart module that rely on `lineAvailability` / `isBuyable` to gate rendering, checkout, or service logic.

## Notes

- **Wishlist lines carry no `quantity`.** The `insufficient_stock` branch is therefore unreachable for them; the `backorder` branch instead treats an undefined quantity as "shelf must be empty" to surface a backorder state.
- **Preorder vs. out-of-stock:** a preorder whose allowance is exhausted still returns `out_of_stock`, not a preorder-specific error. The distinction only matters once `available > 0`.
- **Backorder reads two numbers** (`available` for the combined shelf + room, and `shelf` alone). A line triggers `backorder` when its quantity exceeds the shelf portion, even though the combined allowance still covers it.
- **`active === false`** (hidden) and **`deletedAt !== undefined`** (soft-deleted) both collapse to `removed`; a hard-deleted product is indistinguishable from a lookup miss (`product` is `null`/`undefined`).
