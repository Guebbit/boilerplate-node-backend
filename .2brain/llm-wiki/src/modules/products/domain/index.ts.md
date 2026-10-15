---
source: src/modules/products/domain/index.ts
sha256: b81f277c669939556da57a7f1789b87dc1730a4cfe92c23969348ca0d9baac61
generated_at: 2026-10-15T11:41:18.079291+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/domain/index.ts

## Purpose

Barrel file for the products domain layer. It re-exports the pure business rules (stock and preorder logic) so callers can import domain functions without pulling in the module's HTTP/API surface.

## Key elements

- **`availableStock`** (re-export from `./stock`) — stock availability check.
- **`stockFlags`** (re-export from `./stock`) — returns stock-related flags.
- **`isPreorder`** (re-export from `./preorder`) — determines whether a product is a preorder.
- **`latestReleaseDate`** (re-export from `./preorder`) — resolves the most recent release date.
- **`PreorderFacts`** (type re-export from `./preorder`) — type describing preorder-related data.

## Relationships

- **`src/modules/products/domain/stock.ts`** and **`src/modules/products/domain/preorder.ts`** — source modules whose symbols this file re-exports; no logic of its own.
- **`src/modules/products/index.ts`** — the module's public entry point that consumes these domain exports alongside its HTTP-facing definitions.

## Notes

- This file contains **no logic**—it is purely a re-export surface. Change an export here only if you are adding/removing a domain symbol; implementation changes belong in `stock.ts` or `preorder.ts`.
- The docstring explicitly scopes this as the importable domain boundary (see `docs/theory/domain-layer.md`); treat it as the contract for "products rules without HTTP."
