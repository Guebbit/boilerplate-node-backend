---
source: src/modules/products/domain/buyable.ts
sha256: 268db930cc87901abe80544735b57b4ced54bb8a8c2d9e81b876be2f19d36ddc
generated_at: 2026-10-29T05:25:44.799512+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/domain/buyable.ts

## Purpose

Pure domain rule that answers "can a shopper order this product right now?" at a given instant, plus a transition helper that detects when an edit flips a product from non-buyable to buyable. Keeping this logic in a standalone, clock-injected module means it is trivially testable and reusable by any layer (alerts, CRUD, presentation) that needs to reason about orderability.

## Key elements

- **`BuyableFacts`** — Interface extending `BackorderFacts` with the two synced shelf counters (`onHand`, `reserved`). This is the minimal shape the rule needs from a product record.
- **`isBuyable(facts, now)`** — Returns `true` when the product is active, purchasable, and has something to order: either remaining preorder allowance, positive available stock, or an open backorder window. Returns `false` immediately if `active` or `purchasable` is explicitly `false`.
- **`becameBuyable(before, after, now)`** — True only on the non-buyable → buyable flip. Used to fire side-effects (e.g. notifications) on edit without re-firing while the product stays buyable.

## Relationships

- **`./backorder`** — Provides `isBackorder` and the `BackorderFacts` base type that `BuyableFacts` extends.
- **`./preorder`** — Provides `isPreorder`, used as the first branch in `isBuyable` to route to the allowance check.
- **`./stock`** — Provides `availableStock` and `preorderAllowanceLeft`, the two arithmetic helpers that decide whether units or allowance remain.
- **`./index.ts`** — Re-exports this module so consumers can import from the domain barrel.
- **`services/crud.ts`** — Likely calls `becameBuyable` after a product edit to trigger downstream effects.
- **`stock-alerts/service.ts`** — Uses `isBuyable` (or `becameBuyable`) to decide when a "notify me" subscription should fire.
- **`tests/unit/buyable.test.ts`** — Unit tests exercising the decision table and the flip detection.

## Notes

- `now` is always an explicit parameter; the module never calls `Date.now()` internally. Callers are responsible for supplying the instant.
- `isBuyable` short-circuits on `active === false` / `purchasable === false` before consulting stock or backorder logic, so a disabled product is never buyable regardless of counters.
- `becameBuyable` is strict: it returns `true` **only** on the flip. If a product is already buyable and the edit keeps it buyable, the result is `false`.
- The doc-comment links to `docs/modules/products.md#back-in-stock-signal` for the broader product narrative around this rule.
