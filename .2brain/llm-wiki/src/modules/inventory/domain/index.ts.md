---
source: src/modules/inventory/domain/index.ts
generated_at: 2026-11-22T05:18:20.425475+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/domain/index.ts

## Purpose
Barrel file for the inventory module's domain layer. It re-exports the pure rules from `transitions` and `hold-lines` as a single entry point. Per its header, the domain layer is free of Express, Mongoose and every tier. It holds rules that can be tested without a database, above all the reason→delta table. It does not hold the conditional writes that enforce those rules, the ledger row, or the HTTP envelopes.

## Key elements
- `counterDeltaFor`, `roomOn` — functions re-exported from `./transitions`.
- `CounterDelta`, `HoldKind` — types re-exported from `./transitions`.
- `takeFromHold`, `withAdded` — functions re-exported from `./hold-lines`.
- `HoldLine`, `HoldTake` — types re-exported from `./hold-lines`.

The file defines no logic of its own.

## Relationships
- `src/modules/inventory/domain/transitions.ts` and `src/modules/inventory/domain/hold-lines.ts` are the two files it re-exports from. Their unit tests are `src/modules/inventory/tests/unit/transitions.test.ts` and `src/modules/inventory/tests/unit/hold-lines.test.ts`.
- The module-level files (`src/modules/inventory/index.ts`, `model.ts`, `repository.ts`) and the `services/*` files (`holds`, `levels`, `reserve`, `top-up`, `transition`, `types`) are graph neighbors, but the file content does not show how they use this barrel.

## Notes
- Types are exported with `export type`, separate from the value exports.
- Anything added to the domain layer must stay pure, with no Express, Mongoose or tier imports. The header says this is lint-guaranteed.
- The header references `docs/understand/domain-layer.md#_1-the-folder` for more on the domain folder.
