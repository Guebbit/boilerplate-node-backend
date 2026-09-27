---
source: src/modules/inventory/domain/transitions.ts
sha256: d4357b9218462521ae9e2387d9bfcaea08f4ad4427187334b9592233e86c5c31
generated_at: 2026-09-27T14:55:16.486391+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/domain/transitions.ts

## Purpose

Single source of truth for the seven inventory transitions: given a `StockMovementReason` and a quantity, it returns the signed deltas to apply to the `onHand` and `reserved` counters. The file is deliberately pure (no DB, no status codes, no i18n) so the ledger can be replayed deterministically.

## Key elements

- **`CounterDelta`** (interface) — the shape of a transition's effect: `{ onHandDelta: number; reservedDelta: number }`. Both fields are signed; either may be zero. Recorded on every ledger row to keep the ledger replayable.
- **`counterDeltaFor(reason, quantity)`** (exported function) — total map from `StockMovementReason` to a `CounterDelta`. The seven cases:
  - `reserve` — hold units (increment `reserved`, `onHand` unchanged).
  - `commit` — sale completes (decrement both `onHand` and `reserved` by the same amount).
  - `release` / `expire` — undo a hold (decrement `reserved` only); same arithmetic, kept as separate reasons so the ledger records the story.
  - `receive` — delivery creates units (increment `onHand` only).
  - `restock` — post-`commit` return (increment `onHand` only; `reserved` already zeroed by `commit`).
  - `adjust` — signed `quantity` handles both directions (shrinkage vs. correction) without a second reason code.

## Relationships

- **`src/modules/inventory/domain/index.ts`** — barrel file that re-exports `counterDeltaFor` and `CounterDelta` for consumers.
- **`src/modules/inventory/service.ts`** — calls `counterDeltaFor` to compute the deltas before persisting.
- **`src/modules/inventory/repository.ts`** — applies the returned `CounterDelta` to the stored `onHand`/`reserved` columns.
- **`src/modules/inventory/tests/unit/transitions.test.ts`** — unit-tests every branch of `counterDeltaFor`.
- **`src/types/index.ts`** — provides the `StockMovementReason` enum used as the switch discriminant.

## Notes

- `adjust` is the **only** case where `quantity` is signed (e.g. `-3` for shrinkage). Do not wrap it in `Math.abs`; the sign is intentional and lets one reason cover both directions.
- `release` and `expire` are arithmetically identical (`reservedDelta: -quantity`). They are kept as separate enum values purely for ledger readability—don't merge them.
- Adding an eighth transition means adding one `case` here plus one enum value in `openapi.yaml` (per the module doc-comment). No other code changes are expected in the domain layer.
- Availability math (`onHand - reserved`) lives in `@modules/products/domain/stock.ts`, not here. This file only says what each transition *does* to the counters.
