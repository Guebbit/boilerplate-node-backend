---
source: src/modules/inventory/domain/transitions.ts
source_sha256: 0d18e7e1bb801419b212bc6f3a35991af69ae2fac75f51d1a7ca504fcd17abc1
context_sha256: 90b5921e050207ed62731b945b55581e42b71c5ef6fe1a93dfed55f529150502
generated_at: 2026-11-22T05:18:35.315847+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/domain/transitions.ts

## Purpose
Pure inventory rules: given a stock-movement reason and a quantity, it says how the three stock-level counters (`onHand`, `reserved`, `backordered`) change. It has no status codes, i18n, or database access. It is the single place that defines what each transition does. What a customer may actually buy is explicitly out of scope (that is `availableStock` in `@modules/products`).

## Key elements
- `HoldKind` — `'stock' | 'backorder'`; what a hold's units are. Only `release`/`expire` read it.
- `CounterDelta` — `{ onHandDelta, reservedDelta, backorderedDelta }`, all signed and possibly zero. Every ledger row records all three columns so the ledger can be replayed.
- `counterDeltaFor(reason, quantity, kind = 'stock')` — switch over `StockMovementReason` returning the deltas (`quantity` is written as "+quantity" / "-quantity" below):
  - `reserve`: `reserved +quantity`
  - `ship`: `onHand -quantity`, `reserved -quantity`
  - `release` / `expire`: `reserved -quantity` for stock holds, `backordered -quantity` for `kind === 'backorder'`
  - `backorder` / `owed`: `backordered +quantity`
  - `allocate`: `reserved +quantity`, `backordered -quantity`
  - `receive` / `restock`: `onHand +quantity`
  - `adjust`: `onHand` changes by `quantity`, which is already signed
- `roomOn(level)` — remaining preorder allowance: `Infinity` when `backorderLimit` is `null`, otherwise `max(0, limit - backordered)`. A `null` level, or one with no limit, counts as 0 room.

## Relationships
- Imports `StockMovementReason` from `@types` (`src/types/index.ts`).
- `src/modules/inventory/tests/unit/transitions.test.ts` is the unit test file for this module.
- Other neighbors (`src/modules/inventory/domain/index.ts`, `src/modules/inventory/domain/hold-lines.ts`, `src/modules/inventory/services/transition.ts`, `src/modules/inventory/services/reserve.ts`, `src/modules/inventory/services/levels.ts`, `src/modules/inventory/services/types.ts`, `src/modules/inventory/model.ts`, `src/modules/inventory/repository.ts`) are linked through the dependency graph. The file content shows no direct interaction with them beyond sitting alongside them in the inventory module.

## Notes
- `counterDeltaFor` relies on the `switch` covering every enum value. It has no default branch.
- `release`/`expire` and `backorder`/`owed` share arithmetic and are kept as separate reasons so the ledger records which story it was.
- `adjust` is the only reason where `quantity` is signed; the others expect positive values. There is deliberately no `Math.abs`.
- `ship` moves `onHand` and `reserved` together, so dispatching does not change availability.
- `restock` is returned goods. It leaves `reserved` alone because `ship` already reduced it.
- The `HoldKind` doc comment says `preorder`, but the type's actual value is `'backorder'`.
- `roomOn` deliberately returns `Infinity` rather than `null` for no cap, because `null` would read as sold out in callers' arithmetic.
- Adding a new transition takes one entry in this file plus one new enum value in the OpenAPI spec.
