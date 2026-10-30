---
source: src/modules/inventory/services/index.ts
sha256: 9d493c745190d7af923819f5c5788c6fe1d90ece06706c1bd9769e1f6fd7bd86
generated_at: 2026-10-29T04:03:39.161976+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/index.ts

## Purpose

Barrel (index) file for the inventory service. It re-exports every stock-mutation and stock-query function from the individual flow modules (`reserve`, `holds`, `top-up`, `returns`, `transition`, `sweep`, `levels`, `admin`) and bundles them into a single `inventoryService` object. Consumers import from this one entry point rather than reaching into sub-files. The file also re-exports the shared type surface so callers never need to import from `./types` directly.

## Key elements

- **`inventoryService`** – the sole runtime export; an object literal whose keys are every stock operation (reserve, commit, release, ship, extend, retake, restock, receive, adjust, sweep, query helpers). This is the handle cart and delivery modules use.
- **Re-exported types** – `RetakeOutcome`, `StockLine`, `TopUp`, `StockShortfall`, `ReserveOutcome`, `StockPosition`, `LevelFilters`, `MovementFilters`.
- **Individual function imports** – pulled from sub-modules and re-surfaced as object properties; no logic lives in this file.

## Relationships

- **`cart/services/checkout.ts`**, **`cart/services/shelf.ts`**, **`cart/services/view.ts`** – the cart layer calls `inventoryService` (reserve, commit, release, availability checks) as part of its checkout and shelf-management flows.
- **`cart/tests/integration/*.test.ts`** – integration tests exercise end-to-end cart → inventory interactions (stock flags, backorder, preorder, merge, expected totals) by driving the cart services that in turn invoke `inventoryService`.
- **`delivery/tests/factories.ts`** – test factory that provisions inventory state (receive/adjust/stock levels) used by the delivery integration suite.
- **`delivery/tests/integration/*.test.ts`** – delivery-side tests (backorder, lost-parcel, override-sync, preorder-board, preorder) rely on the inventory service for hold release, shipping, and allocation assertions.

## Notes

- The module doc-block (lines 1–14) is the canonical statement of invariants: every stock mutation passes through `applyTransition`; transactions are used only in `holds` (claim + commit), `admin` (delivery + preorder allocation), and `sweep` (release + announcement). All other writes are conditional single-document updates.
- One-file-per-flow layout is intentional (see `docs/theory/layers.md`); do not add new logic to this index file.
- `refreshStockCacheForOrder` and `refreshStockCacheForProducts` come from *different* sub-modules (`holds` vs `transition`) but share a similar name — check which one you need when refreshing cache.
