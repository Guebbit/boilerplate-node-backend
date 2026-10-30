---
source: src/modules/products/tests/unit/buyable.test.ts
sha256: 0fdef2ac54261a883b0c70826e7456c728a680ba72da2d636b804c4eb9573a7e
generated_at: 2026-10-29T05:34:39.024172+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/unit/buyable.test.ts

## Purpose

Unit tests for the two pure functions exported by the products domain (`isBuyable`, `becameBuyable`). Because both are pure, every case runs against three fixed `Date` constants rather than the wall clock, so no timer mocking is needed.

## Key elements

- **`isBuyable` block** — 11 table-driven cases (`it.each`) covering in-stock, fully reserved, empty shelf, backorder open/capped/expired, hidden (`active: false`), off-sale (`purchasable: false`), and preorder scenarios. Signature: `isBuyable(facts, now) → boolean`.
- **`becameBuyable` block** — 7 table-driven cases that supply a *before* and *after* product snapshot plus the current time to assert whether the product *transitioned* into a buyable state. Signature: `becameBuyable(before, after, now) → boolean`.
- **Fixed date constants** — `NOW` (2026-10-12), `LATER` (2026-12-01), `EARLIER` (2026-09-01). These anchor the preorder/restock-date logic deterministically.

## Relationships

- **`src/modules/products/domain/buyable.ts`** — sole import source; provides the two functions under test. This file is the only test consumer visible in the dependency graph.

## Notes

- Both functions are pure: no I/O, no timers. The only "environment" parameter is an explicit `Date`, so tests never call `jest.useFakeTimers` or `Date.now`.
- `becameBuyable` takes two full snapshots (`before`, `after`) rather than a delta; tests must therefore keep the `before` state buyable-adjacent (e.g., `active: false` with stock) to exercise the transition edge.
- The `_name` column in each `it.each` row is a human-readable label only; it is intentionally unused in the assertion body.
