---
source: src/modules/inventory/domain/transitions.ts
sha256: 9dd7e70094382b98cc991c16f1bb8343143714d0cca23d30fa9873637371131f
generated_at: 2026-10-29T04:00:27.265047+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/domain/transitions.ts

## Purpose

Pure domain rules that map each of the nine stock-movement transitions to the exact deltas applied to a product's three counters (`onHand`, `reserved`, `backordered`). No I/O, no status codes, no i18n — data in, a `CounterDelta` out. It also provides a small helper to compute remaining preorder allowance. This is the single source of truth for what a transition does; adding a tenth transition means one more case here plus one enum value in `openapi.yaml`.

## Key elements

- **`HoldKind`** (`'stock' | 'backorder'`) — distinguishes units that physically exist from units that are only a claim on the preorder allowance.
- **`CounterDelta`** — a record of three signed deltas (`onHandDelta`, `reservedDelta`, `backorderedDelta`); every column is always present so the ledger is replayable.
- **`counterDeltaFor(reason, quantity, kind?)`** — total switch over `StockMovementReason`; returns the `CounterDelta` for `reserve`, `ship`, `release`, `expire`, `backorder`, `allocate`, `receive`, `restock`, and `adjust`. `kind` is only consulted by `release`/`expire` (a backorder claim returns allowance, not `reserved`).
- **`roomOn(level)`** — returns remaining preorder capacity (`backorderLimit - backordered`, clamped ≥ 0). A `null` limit yields `Infinity` (uncapped), and a `null` level yields `0` (closed).

## Relationships

- **`src/types/index.ts`** — provides the `StockMovementReason` enum that keys the switch in `counterDeltaFor`.
- **`src/modules/inventory/services/transition.ts`** — the application service that calls `counterDeltaFor` to compute the delta before persisting it via the repository.
- **`src/modules/inventory/repository.ts`** — the persistence boundary that applies the returned `CounterDelta` to the model row.
- **`src/modules/inventory/model.ts`** — defines the counter fields the deltas are applied to.
- **`src/modules/inventory/services/reserve.ts`** — constructs holds whose `HoldKind` determines which branch of `release`/`expire` fires later.
- **`src/modules/inventory/services/levels.ts`** — manages the level row that `roomOn` reads for preorder capacity.
- **`src/modules/inventory/domain/index.ts`** — barrel re-export; consumers import `counterDeltaFor` and `roomOn` through the domain entry point.
- **`src/modules/inventory/tests/unit/transitions.test.ts`** — unit tests exercising every case of `counterDeltaFor` and edge cases of `roomOn`.

## Notes

- `quantity` is **always positive** except for `adjust`, where the sign encodes direction (e.g. `-3` = shrinkage). Do not pass `Math.abs`-ed values for `adjust`.
- `release` and `expire` are arithmetic-identical but kept as separate enum values so the ledger records the narrative (customer cancel vs. timeout).
- `roomOn` never returns `null` or a negative number; callers can safely do `quantity > roomOn(level)` without a null guard.
- `ship` moves `onHand` and `reserved` together so a dispatch does not alter sellable availability for other holds.
- The file is deliberately side-effect-free; any I/O belongs in `services/` or `repository.ts`.
