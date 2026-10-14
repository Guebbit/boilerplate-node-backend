---
source: src/modules/inventory/domain/transitions.ts
sha256: 599c643ffff3a96f6c46dc27fc43a25ba19fba31101dcafd8dba460ddf552468
generated_at: 2026-10-14T15:54:21.070941+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/domain/transitions.ts

## Purpose

Pure domain rule that maps each of the nine inventory transitions (reserve, ship, release, expire, preorder, allocate, receive, restock, adjust) to its effect on the three stock counters (`onHand`, `reserved`, `preordered`). Exists as a single, total decision point so that adding a tenth transition requires one entry here plus one enum value in `openapi.yaml`, and so that the ledger remains replayable regardless of which service or hold-line produced the movement.

## Key elements

- **`HoldKind`** (`'stock' | 'preorder'`) — distinguishes whether a hold's units exist on the shelf or are only a claim against `preorderLimit`. Only relevant to the `release`/`expire` cases.
- **`CounterDelta`** — the three signed deltas (`onHandDelta`, `reservedDelta`, `preorderedDelta`) that a single transition produces. Every column is always present (zero if untouched) to keep ledger rows self-contained.
- **`counterDeltaFor(reason, quantity, kind)`** — the sole exported function. Takes a `StockMovementReason`, a unit count, and an optional `HoldKind`, and returns the `CounterDelta` implied by that transition. No I/O, no error throwing; an invalid reason is a type-level impossibility (the switch is exhaustive over the enum).

## Relationships

- **`src/types/index.ts`** — provides `StockMovementReason`, the enum that drives the switch.
- **`src/modules/inventory/services/transition.ts`** — the service-layer caller; invokes `counterDeltaFor` and persists the resulting deltas via the repository.
- **`src/modules/inventory/services/types.ts`** — likely re-exports or references `HoldKind` / `CounterDelta` in its public service signatures.
- **`src/modules/inventory/domain/hold-lines.ts`** — sibling domain module in the same inventory domain; both are consumed by the transition service when building a ledger row.
- **`src/modules/inventory/domain/index.ts`** — barrel file that re-exports this module's types and function for external import.
- **`src/modules/inventory/model.ts`** — defines the persistent inventory record whose fields (`onHand`, `reserved`, `preordered`) the deltas are applied to.
- **`src/modules/inventory/repository.ts`** — applies the computed deltas to the model and writes the ledger entry.
- **`src/modules/inventory/tests/unit/transitions.test.ts`** — unit tests covering every `StockMovementReason` × `HoldKind` combination.

## Notes

- `adjust` is the **only** transition where `quantity` is signed (e.g. `-3` for shrinkage, `+5` for a correction). All other transitions expect a positive quantity. Do not call `Math.abs` on it — the sign is intentional.
- `release` and `expire` produce identical arithmetic but are kept as separate enum values so the ledger can record *why* units were freed (customer cancellation vs. timeout).
- The `kind` parameter defaults to `'stock'`; passing `'preorder'` only changes the outcome for `release`/`expire` (decrements `preordered` instead of `reserved`). For all other transitions the `kind` argument is ignored.
- This module deliberately does **not** compute customer-facing `availableStock`; that logic lives in `src/modules/products/domain/stock.ts`.
