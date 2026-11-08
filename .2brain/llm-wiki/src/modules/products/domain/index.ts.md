---
source: src/modules/products/domain/index.ts
sha256: 13c9e51a5ca457be2879d56a747f59f3c3bcf90c6bd91fa58a9176eedd7dc92e
generated_at: 2026-11-08T07:43:37.826550+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/domain/index.ts

## Purpose

Barrel file for the products domain layer. It re-exports the pure business rules (stock, preorder, backorder, buyability) so that consumers can import domain logic without pulling in the module's HTTP surface. This enforces the boundary described in `docs/theory/domain-layer.md`.

## Key elements

- **`availableStock`, `stockFlags`** — stock-state helpers re-exported from `./stock`.
- **`isPreorder`, `latestReleaseDate`** — preorder classification and date logic from `./preorder`.
- **`isBackorder`** — backorder predicate from `./backorder`.
- **`isBuyable`, `becameBuyable`** — buyability evaluation from `./buyable`.
- **`BuyableFacts`, `BackorderFacts`, `PreorderFacts`** — type-only exports describing the inputs each predicate expects.

## Relationships

- **`src/modules/products/domain/stock.ts`**, **`preorder.ts`**, **`backorder.ts`**, **`buyable.ts`** — this file's sole imports; it re-exports selected symbols from each.
- **`src/modules/products/index.ts`** — the module-level barrel that sits above this domain index and exposes both domain and HTTP concerns to the wider codebase.

## Notes

- The module JSDoc (`@module`) signals this is an intentionally narrow surface. Do not add re-exports for HTTP controllers, repositories, or side-effecting helpers here—those belong in the parent `products/index.ts`.
- Only *selected* symbols are re-exported (e.g., `isBackorder` but not every internal helper in `backorder.ts`). Treat this list as the public domain API; anything not listed is internal to its sub-module.
