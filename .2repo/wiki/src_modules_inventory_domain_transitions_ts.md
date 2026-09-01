# src/modules/inventory/domain/transitions.ts

## Purpose

Pure domain rules for inventory stock counters. Defines what each of the six stock-movement transitions does to a product's `onHand` and `reserved` counters, and provides the single canonical definition of customer-facing availability. No I/O, no status codes, no i18n — data in, verdict out.

## Key elements

- **`CounterDelta`** (interface) — a pair of signed numbers (`onHandDelta`, `reservedDelta`) describing how one transition shifts the two counters. Stored on every ledger row so sequences can be replayed.
- **`counterDeltaFor(reason, quantity)`** (const) — total map from `StockMovementReason` to a `CounterDelta`. Handles all six transitions: `reserve`, `commit`, `release`, `expire`, `receive`, `adjust`. For `adjust` the `quantity` parameter is already signed; for all others it is positive.
- **`availabilityOf(counters)`** (const) — returns `max(0, onHand − reserved)`. The only definition of availability in the codebase; clamps at zero so a negative count never reaches a UI.

## Relationships

- **`src/types/index.ts`** — provides the `StockMovementReason` enum that `counterDeltaFor` switches over.
- **`src/modules/inventory/domain/index.ts`** — barrel file; re-exports this module so consumers import from the domain index rather than the file directly.
- **`src/modules/inventory/service.ts`** — the service layer that calls `counterDeltaFor` and `availabilityOf` when processing stock movements and reading product state.
- **`src/modules/inventory/tests/unit/transitions.test.ts`** — unit tests covering the transition arithmetic and availability clamping.
- **`src/modules/cart/tests/unit/domain-rules.test.ts`** — cart-side tests that exercise availability logic defined here.

## Notes

- `release` and `expire` produce identical arithmetic (`reservedDelta: -quantity`); they exist as separate enum values only so the ledger can record *why* a hold was lifted.
- `commit` moves both counters simultaneously (onHand −q, reserved −q), so a completed sale does not change availability.
- Adding a seventh transition requires one new `case` here **and** one new enum value in `openapi.yaml`.
- The `quantity` parameter is positive for every transition except `adjust`, where it is signed. Do not apply `Math.abs` to `adjust`'s quantity — the sign carries direction.
