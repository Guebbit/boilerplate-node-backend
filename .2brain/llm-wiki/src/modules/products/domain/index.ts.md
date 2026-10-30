---
source: src/modules/products/domain/index.ts
sha256: 13c9e51a5ca457be2879d56a747f59f3c3bcf90c6bd91fa58a9176eedd7dc92e
generated_at: 2026-10-29T05:25:51.712026+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/domain/index.ts

## Purpose

Barrel file that exposes the **domain rules** of the products module as a single import point. It isolates pure business logic (stock, preorder, backorder, buyability) from the module's HTTP surface, so consumers can `import { isBuyable } from '…/products/domain'` without pulling in routes or controllers.

## Key elements

- **`availableStock`, `stockFlags`** — re-exported from `./stock`; stock-availability queries.
- **`isPreorder`, `latestReleaseDate`** — re-exported from `./preorder`; preorder predicates and date helpers.
- **`isBackorder`** — re-exported from `./backorder`; backorder predicate.
- **`isBuyable`, `becameBuyable`** — re-exported from `./buyable`; buyability checks and transition detection.
- **`BuyableFacts`** (type) — the data shape `isBuyable` expects, from `./buyable`.
- **`BackorderFacts`** (type) — the data shape `isBackorder` expects, from `./backorder`.
- **`PreorderFacts`** (type) — the data shape `isPreorder` expects, from `./preorder`.

## Relationships

- **Re-exports from** `backorder.ts`, `buyable.ts`, `preorder.ts`, and `stock.ts` — each contributes one or two named values (and/or a type) to this surface.
- **Imported by** `src/modules/products/index.ts` (the module's public entry point), which in turn surfaces these names to the rest of the codebase.

## Notes

- Exports are **explicitly named**, not a wildcard `export *`. Any new function added to a domain submodule will *not* appear here until someone adds it to this list — intentional, to keep the public surface small.
- Value exports and type exports are in **separate statements** (`export { … }` vs. `export type { … }`), which matters for `isolatedModules` / `verbatimModuleSyntax` tooling.
- The JSDoc header points to `docs/theory/domain-layer.md` for the architectural rationale behind this separation.
