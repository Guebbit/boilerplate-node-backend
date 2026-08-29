# src/modules/inventory/domain/transitions.ts

## Purpose

Pure domain rules for inventory stock movements. Defines what each of the six stock transitions does to a product's two counters (`onHand`, `reserved`) and provides the single definition of customer-facing availability. No I/O, no status codes, no database — data in, verdict out.

## Key elements

- **`CounterDelta`** (interface) — A pair of signed numbers (`onHandDelta`, `reservedDelta`) describing how one transition moves the counters. Recorded on every ledger row to keep the ledger replayable.
- **`counterDeltaFor(reason, quantity)`** (const) — Total map from `StockMovementReason` to a `CounterDelta`. The six cases: `reserve`, `commit`, `release`, `expire`, `receive`, `adjust`.
- **`availabilityOf(counters)`** (const) — Returns `max(0, onHand − reserved)`. The one place in the codebase where "how many units a customer may buy" is defined.

## Relationships

- **`src/types/index.ts`** — Provides the `StockMovementReason` enum that `counterDeltaFor` switches on.
- **`src/modules/inventory/domain/index.ts`** — Barrel file that re-exports `CounterDelta`, `counterDeltaFor`, and `availabilityOf` for downstream consumers.
- **`src/modules/inventory/service.ts`** — Service layer that calls `counterDeltaFor` and `availabilityOf` to compute ledger entries and stock levels.
- **`src/modules/inventory/tests/unit/transitions.test.ts`** — Unit tests for the functions in this file.
- **`src/modules/cart/tests/unit/domain-rules.test.ts`** — Cart-module tests that exercise the domain rules exported from this file.

## Notes

- `adjust` is the only transition where `quantity` is **signed** (negative = shrinkage). The other five accept only positive quantities. Do not wrap `quantity` in `Math.abs` for `adjust`; the sign *is* the direction.
- `release` and `expire` produce identical arithmetic (`{0, −q}`) but remain separate cases so the ledger can distinguish "customer cancelled" from "hold timed out."
- `availabilityOf` clamps at zero. The invariant `reserved ≤ onHand` is expected but not enforced here; a negative value must never reach a UI.
- The file header mentions a "seventh" transition defined as one entry here plus one enum value in `openapi.yaml` — this describes the *addition procedure*, not a currently implemented case.
- Pure by contract: importing this file must not cause side effects, I/O, or i18n lookups.
