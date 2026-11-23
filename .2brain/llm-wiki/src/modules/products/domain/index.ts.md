---
source: src/modules/products/domain/index.ts
source_sha256: 8dfc7188b7d691d06440c84c3b0d5b43c6cb28b2009107b179200d1404db0695
context_sha256: 8936c7899a228918e8f2b5d2982cddd19b293b9fb808265f79d0f064fb6aa108
generated_at: 2026-11-22T07:09:08.997351+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/domain/index.ts

## Purpose
Barrel file for the products domain layer. It re-exports the domain rules (actions, stock, preorder, backorder, availability) so they can be imported without pulling in the module's HTTP surface.

## Key elements
- `productActions`, `NO_PRODUCT_ACTIONS`, `NO_PRODUCT_STANDING` — re-exported from `./actions`. The type `ProductStanding` comes from the same file.
- `availableStock` — re-exported from `./stock`.
- `isPreorder`, `latestReleaseDate` — re-exported from `./preorder`.
- `isBackorder` — re-exported from `./backorder`.
- `availabilityOf` — re-exported from `./availability`.
- Types:
  - `Availability`, `AvailabilityCounts`, `AvailabilityTerms`, `AvailabilityFacts` (from `./availability`)
  - `BackorderFacts` (from `./backorder`)
  - `PreorderFacts` (from `./preorder`)

## Relationships
- Re-exports from `actions.ts`, `stock.ts`, `preorder.ts`, `backorder.ts` and `availability.ts`. It contains no logic of its own.
- `src/modules/products/index.ts` is a graph neighbor. The file's header describes this barrel as the domain entry point that is importable without the HTTP surface.

## Notes
- The header comment's `@see` tag references a domain-layer document for the folder's conventions.
- Types are exported with `export type`, so they are erased at runtime.
