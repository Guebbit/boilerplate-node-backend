---
source: src/modules/products/domain/index.ts
sha256: 51c450f29877818d3ebc908de954dbdbfd64282d5f7ccfc06362768000182628
generated_at: 2026-11-14T21:23:54.888570+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/domain/index.ts

## Purpose

Barrel (re-export) file that defines the **public API surface** of the products domain layer. It curates a selective set of symbols from the domain's sub-modules so that consumers can import domain rules without reaching into individual files or pulling in the module's HTTP surface. See `docs/theory/domain-layer.md` for the architectural rationale.

## Key elements

- **Re-exports from `./actions`** — `productActions`, `NO_PRODUCT_ACTIONS`, `NO_PRODUCT_STANDING` (values) and the `ProductStanding` type.
- **Re-exports from `./stock`** — `availableStock`, `stockFlags`.
- **Re-exports from `./preorder`** — `isPreorder`, `latestReleaseDate` (values) and the `PreorderFacts` type.
- **Re-exports from `./backorder`** — `isBackorder` (value) and the `BackorderFacts` type.
- **Re-exports from `./buyable`** — `isBuyable`, `becameBuyable` (values) and the `BuyableFacts` type.

No logic lives in this file; it is purely an `export` list.

## Relationships

- **`./actions`, `./stock`, `./preorder`, `./backorder`, `./buyable`** — source modules whose symbols are re-exported here. Changing their exports requires updating this barrel if the public surface should change.
- **`src/modules/products/index.ts`** — the parent module's top-level index; expected to import from this domain barrel to expose domain rules alongside the HTTP surface.
- **`src/modules/products/tests/unit/stock-view.test.ts`** — unit test in the dependency graph that consumes symbols from this barrel rather than reaching into the sub-modules directly.

## Notes

- Exports are **selective**, not `export *`. If a new symbol in a sub-module should be part of the domain's public API, it must be explicitly added here.
- Types and values are exported separately (`export type` vs. `export`). Consumers using `verbatimModuleSyntax` or isolated module settings must respect this split.
- The file carries no runtime logic; bundlers will tree-shake it away. Any "side effect" of importing from here is limited to whatever the sub-modules themselves execute.
