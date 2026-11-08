---
source: src/modules/products/tests/unit/buyable.test.ts
sha256: 0fdef2ac54261a883b0c70826e7456c728a680ba72da2d636b804c4eb9573a7e
generated_at: 2026-11-08T07:53:41.327335+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/buyable.test.ts

## Purpose

Unit tests for the two pure buyability functions (`isBuyable`, `becameBuyable`) in the products domain. Because both functions accept an explicit `Date` parameter rather than reading the system clock, every scenario runs against three fixed instants (`NOW`, `LATER`, `EARLIER`) with no `jest.useFakeTimers` or other clock mocking required.

## Key elements

- **`isBuyable` block** – Table-driven (`it.each`) cases covering: on-hand vs. reserved stock, empty shelf, backorder (open, cap-reached, restock-date-passed), hidden (`active: false`) and off-sale (`purchasable: false`) products, and preorder logic (`releaseDate` in the future + `backorderLimit`).
- **`becameBuyable` block** – Table-driven transition tests that pass a `before` and `after` facts object and assert whether the product *newly* became buyable. Covers stock arrival, backorder opening, visibility/sale toggles, and a restock-date being pushed past `NOW`.
- **`NOW` / `LATER` / `EARLIER`** – Module-level `Date` constants that serve as the deterministic "clock" for every assertion.

## Relationships

- **`src/modules/products/domain/buyable.ts`** – Sole import target. Provides `isBuyable(facts, now)` and `becameBuyable(before, after, now)`; this file exercises both with no other collaborators.

## Notes

- **No clock mocking.** The module docstring explicitly states the functions are pure; the date is always a parameter, so the tests just pass a fixed `Date`.
- **Preorder is independent of shelf stock.** The last `isBuyable` case (`{ releaseDate: LATER, onHand: 9 }` → `false`) confirms that physical stock on hand does *not* make a future-dated preorder buyable; only the `backorderLimit` / `backordered` pair governs that path.
- **`becameBuyable` is a delta check, not a state check.** The "stock arrives for a product already buyable" case (`onHand: 1 → 5`) returns `false`, confirming the function reports *transitions*, not absolute buyability.
