---
source: src/modules/inventory/domain/transitions.ts
sha256: 106c2e08dbdfdac7c8f601a0a8fcc8e90b6eaba09b3697fdf5f5aec500549bd1
generated_at: 2026-11-08T05:58:51.958271+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/domain/transitions.ts

## Purpose

Pure inventory-domain rules that translate a stock-movement reason and quantity into deterministic counter deltas (`onHand`, `reserved`, `backordered`). It is the single source of truth for what each of the ten transitions does to those counters, with no side effects, status codes, i18n, or database access.

## Key elements

- **`HoldKind`** — union `'stock' | 'backorder'`; distinguishes whether held units are real shelf stock or a claim on the preorder allowance.
- **`CounterDelta`** — interface with three signed numeric fields (`onHandDelta`, `reservedDelta`, `backorderedDelta`) describing one transition's effect. Recording all three on every ledger row keeps the ledger replayable.
- **`counterDeltaFor(reason, quantity, kind?)`** — the core function. Switches over `StockMovementReason` and returns the corresponding `CounterDelta`. Ten cases: `reserve`, `ship`, `release`/`expire`, `backorder`/`owed`, `allocate`, `receive`, `restock`, `adjust`.
- **`roomOn(level)`** — returns the remaining preorder allowance (`backorderLimit − backordered`, floored at 0). Returns `Infinity` when `backorderLimit` is explicitly `null` (no cap) or when `level` itself is `null`.

## Relationships

- **`src/types/index.ts`** — provides `StockMovementReason`, the enum this file switches over.
- **`src/modules/inventory/domain/index.ts`** — barrel for the inventory domain; re-exports this file alongside `hold-lines.ts`.
- **`src/modules/inventory/domain/hold-lines.ts`** — sibling domain file; `HoldKind` shared here is the same notion used to tag hold-line records there.
- **`src/modules/inventory/services/transition.ts`** — service layer that calls `counterDeltaFor` and persists the resulting deltas.
- **`src/modules/inventory/services/reserve.ts`** — uses `roomOn` (and/or `counterDeltaFor`) when creating a hold.
- **`src/modules/inventory/services/levels.ts`** — provides the `backorderLimit` / `backordered` values that `roomOn` consumes.
- **`src/modules/inventory/model.ts`** — defines the stock entity whose three counters this file's deltas apply to.
- **`src/modules/inventory/repository.ts`** — persistence boundary; the caller of services that, in turn, call into this file.
- **`src/modules/inventory/tests/unit/transitions.test.ts`** — unit tests for `counterDeltaFor` and `roomOn`.

## Notes

- `adjust` is the **only** case where `quantity` is expected to be pre-signed (negative = shrinkage). All other cases take a positive magnitude.
- `release`/`expire` and `backorder`/`owed` are arithmetic duplicates; they exist as separate enum values solely so the ledger can record *which story* prompted the change.
- `ship` decrements both `onHand` and `reserved` simultaneously so a dispatch does not alter the product's sellable availability.
- Adding a new transition is a two-file change: one `case` here + one value in `openapi.yaml`'s `StockMovementReason` enum.
- `roomOn` deliberately returns `Infinity` (not `null`/`undefined`) for an uncapped product so that caller arithmetic (`Infinity − n = Infinity`) works without a guard.
