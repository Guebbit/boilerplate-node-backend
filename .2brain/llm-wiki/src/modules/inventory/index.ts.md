---
source: src/modules/inventory/index.ts
source_sha256: 444cc45b8cbcf1455e15d349e4485559cc5343aad2237b6e9e1c5d6adaec4520
context_sha256: 6af418fccc7d87c1db54fce65c451556d17e70a9633e8cf1c8983deffe8c608c
generated_at: 2026-11-22T05:18:59.328149+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/index.ts

## Purpose
Public barrel for the Inventory module. Per its header comment, it is the only surface sibling modules may import. It deliberately leaves out repositories, models, and counter primitives, so siblings can request a named transition and get a boolean back without touching stock counters directly.

## Key elements
- `export * from './services'`: re-exports the service layer, the named transitions siblings call.
- `export * from './domain'`: re-exports domain exports.
- `export * from './events'`: re-exports event exports.
- `export type * from './model'`: re-exports model **types only**. The models themselves are not exposed as values.

## Relationships
The neighbor files are the module's consumers. They are listed as graph neighbors, and the barrel's own contents are not visible beyond its four re-exports.
- **Cart** (`src/modules/cart/services/checkout.ts`, `shelf.ts`, `view.ts`) and **Delivery** (`src/modules/delivery/module.ts`) are sibling modules, which the header says must import through this barrel.
- The cart integration tests (backorder, checkout-expected-total, merge, preorder, stock-flag, stock) and the delivery tests (`factories.ts` and the backorder, lost-parcel, override-sync, and preorder-board integration tests) are also neighbors. They cover stock-related behavior across the module boundary.

## Notes
- Do not add exports for repositories, models, or counter primitives. The header says publishing them would remove the guarantee the module exists to provide.
- The header carries `@see` references to documentation on the module's neighbourhood and on the "published language — the barrel" rule in the strategic DDD docs.
