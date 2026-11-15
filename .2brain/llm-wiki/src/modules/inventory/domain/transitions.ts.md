---
source: src/modules/inventory/domain/transitions.ts
sha256: bd6107d3c392688ad954575bbcafe8a1b57b3a4589813267e0a2c3bb97e465c0
generated_at: 2026-11-14T20:03:24.306958+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/domain/transitions.ts

## Purpose

Pure, side-effect-free rules that map a `StockMovementReason` to the exact deltas applied to a stock level's three counters (`onHand`, `reserved`, `backordered`). It exists as the single authoritative place defining what each inventory transition does, so that services, repositories, and tests all read the same semantics without duplicating the logic.

## Key elements

- **`HoldKind`** — `'stock' | 'backorder'`. Distinguishes units that physically exist from units that are only a claim on the preorder allowance.
- **`CounterDelta`** — interface with `onHandDelta`, `reservedDelta`, `backorderedDelta`. Every transition returns all three fields (possibly zero) so the ledger stays replayable.
- **`counterDeltaFor(reason, quantity, kind?)`** — the core lookup. Switches on `StockMovementReason` and returns the corresponding `CounterDelta`. Handles `reserve`, `ship`, `release`/`expire`, `backorder`/`owed`, `allocate`, `receive`, `restock`, and `adjust`.
- **`roomOn(level)`** — computes remaining preorder allowance from a level row. Returns `Infinity` when `backorderLimit` is explicitly `null` (no cap), and `0` when the level row is absent.

## Relationships

- **`src/types/index.ts`** — provides the `StockMovementReason` enum that `counterDeltaFor` switches on.
- **`src/modules/inventory/domain/index.ts`** — barrel re-export; consumers import from the domain barrel rather than this file directly.
- **`src/modules/inventory/services/transition.ts`** — service layer that calls `counterDeltaFor` and then persists the result.
- **`src/modules/inventory/services/reserve.ts`** — builds reserve/release/expire flows that depend on the deltas returned here.
- **`src/modules/inventory/services/levels.ts`** — likely consumes `roomOn` for preorder-capacity checks.
- **`src/modules/inventory/repository.ts`** — persists the counter changes produced by applying the deltas.
- **`src/modules/inventory/model.ts`** — defines the stock-level shape (`onHand`, `reserved`, `backordered`) that the deltas mutate.
- **`src/modules/inventory/tests/unit/transitions.test.ts`** — unit tests covering every branch of `counterDeltaFor` and edge cases of `roomOn`.

## Notes

- `adjust` is the **only** transition where `quantity` is signed (negative = shrinkage). All others expect a positive magnitude.
- `release`/`expire` and `backorder`/`owed` are arithmetic-identical pairs kept as separate enum values purely so the ledger can record *why* the same delta happened.
- For `release`/`expire` on a `'backorder'` hold, the delta touches `backorderedDelta` (negative), not `reservedDelta`, because a preorder claim never incrementing `reserved`.
- `roomOn` deliberately returns `Infinity` (not a large number) when `backorderLimit` is `null`, and returns `0` when the level object itself is `null`. Callers must treat a missing level as "closed."
- Adding a new transition requires: one `case` here **and** one enum value in `openapi.yaml`.
- This module does **not** decide purchasable availability; that logic lives in `src/modules/products/domain/stock.ts` (`availableStock`).
