---
source: src/modules/inventory/domain/transitions.ts
sha256: 0608559dfaac273780a845a78bd4ddd7a5d6d9040587a03539b8c84e8d4366ec
generated_at: 2026-09-23T18:44:25.175086+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/domain/transitions.ts

## Purpose

Defines the six inventory stock transitions as pure data-in / verdict-out functions. A product carries two counters (`onHand`, `reserved`); this file is the single source of truth for what each transition does to those counters and for computing customer-visible availability. No side effects, no i18n, no database access.

## Key elements

- **`CounterDelta`** (interface) — the signed pair of counter changes (`onHandDelta`, `reservedDelta`) that a transition implies. Recorded on every ledger row to make the ledger replayable.
- **`counterDeltaFor(reason, quantity)`** — total map from `StockMovementReason` to `CounterDelta`. Six cases:
  - `reserve`: +reserved only (hold).
  - `commit`: −onHand and −reserved together (sale completes; availability unchanged).
  - `release` / `expire`: −reserved only (hold lifted; identical arithmetic, distinct ledger story).
  - `receive`: +onHand only (delivery; the only transition that creates units).
  - `adjust`: signed onHand delta only (quantity is pre-signed; `+n` gains, `−n` shrinkage).
- **`availabilityOf(counters)`** — the one definition of customer availability in the codebase: `(onHand − reserved)` clamped at zero. Accepts optional fields.

## Relationships

- **`src/types/index.ts`** — supplies the `StockMovementReason` enum consumed by `counterDeltaFor`.
- **`src/modules/inventory/domain/index.ts`** — barrel file; re-exports this module so callers import from the domain namespace rather than the file path.
- **`src/modules/inventory/service.ts`** — calls `counterDeltaFor` to derive the deltas it writes through the repository.
- **`src/modules/inventory/repository.ts`** — persists the counter deltas returned by this module; does not re-derive them.
- **`src/modules/inventory/tests/unit/transitions.test.ts`** — unit tests covering every transition case and the availability clamp.
- **`src/modules/cart/tests/unit/domain-rules.test.ts`** — exercises `availabilityOf` as part of cart-domain rule assertions.

## Notes

- `availabilityOf` clamps at zero deliberately: a negative result (e.g. `reserved > onHand`) is treated as a bug that must never surface to a screen.
- `release` and `expire` share identical arithmetic but are kept as separate enum values so the ledger can distinguish *who* lifted the hold.
- `adjust` is the only case where `quantity` may be negative; the code intentionally does **not** call `Math.abs`, relying on the caller to pass the correct sign.
- Adding a seventh transition requires exactly two changes: one `case` in `counterDeltaFor` and one enum value in `openapi.yaml`.
