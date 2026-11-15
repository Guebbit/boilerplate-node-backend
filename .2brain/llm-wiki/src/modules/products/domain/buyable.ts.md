---
source: src/modules/products/domain/buyable.ts
sha256: e9c8fa6492941d1cb16170b059324ae3498596d3b4a065598a0c5118f911a11d
generated_at: 2026-11-14T21:23:39.245459+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/domain/buyable.ts

## Purpose

Pure decision logic that answers two questions: "Can this product be ordered right now?" and "Did an edit just make it orderable?" It consolidates the stock, preorder, and backorder rules into a single `isBuyable` predicate so that alerting, UI, and CRUD flows share one definition of "buyable."

## Key elements

- **`BuyableFacts`** (interface) — Extends `BackorderFacts` with optional `onHand` and `reserved` counters. The minimal shape of product data the buyable rule needs.
- **`isBuyable(facts, now)`** (function) — Returns `false` if the product is inactive or marked non-purchasable. Otherwise: if it's a preorder, checks that the backorder allowance still has room; if not, returns `true` when shelf stock > 0 *or* a backorder window is open.
- **`becameBuyable(before, after, now)`** (function) — Detects the strict flip from not-buyable to buyable between two snapshots at the same instant. Returns `true` only on the transition.

## Relationships

- **`src/modules/products/domain/backorder.ts`** — Imports `isBackorder` and the `BackorderFacts` base type (which `BuyableFacts` extends).
- **`src/modules/products/domain/preorder.ts`** — Imports `isPreorder` to branch into the allowance-based path.
- **`src/modules/products/domain/stock.ts`** — Imports `availableStock` and `preorderAllowanceLeft` for the two numeric checks.
- **`src/modules/products/domain/index.ts`** — Barrel file that re-exports this module's public API for consumers outside the domain folder.
- **`src/modules/products/services/crud.ts`** — Calls `becameBuyable` after a product edit to detect the "it's back" transition.
- **`src/modules/products/services/lookups.ts`** — Reads `isBuyable` to filter or annotate product lists.
- **`src/modules/products/presenter.ts`** — Uses `isBuyable` to decide what the shopper-facing UI displays (order button vs. notify).
- **`src/modules/products/tests/unit/buyable.test.ts`** — Unit tests covering the predicate and the flip detection.
- **`src/modules/stock-alerts/service.ts`** — Subscribes to `becameBuyable` transitions to fire "product is back in stock" notifications.

## Notes

- The module is deliberately **pure**: `now` is always passed in; there is no `Date.now()` call here. Tests and callers control the clock.
- `onHand` and `reserved` are optional in `BuyableFacts`; `availableStock` treats missing values as zero, so a product with no counters falls through to the backorder check.
- `becameBuyable` is intentionally asymmetric (non-buyable → buyable only). The reverse flip (product delisted) is handled elsewhere.
- The doc block references `docs/modules/stock-alerts.md` for broader context on the "notify me" flow this rule powers.
