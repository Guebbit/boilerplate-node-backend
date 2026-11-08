---
source: src/modules/returns/domain/lifecycle.ts
sha256: a4b9d1b9afd27adbc716acd31a9b287404c570ed06772850b5ed7af1b3fc3fe9
generated_at: 2026-11-08T07:57:39.030133+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/lifecycle.ts

## Purpose

Defines the return lifecycle as a set of status-transition guards and helper predicates. Each exported array enumerates the *source* statuses from which a particular write operation may proceed, and these arrays are consumed directly as conditional-write predicates (via `repository.ts`'s `claimStatus`), making them the concurrency guard that ensures exactly one staff action wins a race. The file is a pure, side-effect-free module: it imports only type definitions and exports constants and small functions.

## Key elements

- **`ReturnStatus`, `ReturnReason`, `ReturnKind`, `ReturnRemedy`** — Re-exported type aliases from `@types` for convenience by downstream importers.
- **`DECIDABLE_RETURN_STATUSES`** — `[requested]`. The only status from which `decide.ts` may approve or decline.
- **`RECEIVABLE_RETURN_STATUSES`** — `[approved]`. The only status from which `receive.ts` may record goods arrival.
- **`CLOSABLE_RETURN_STATUSES`** — `[received]`. The only status from which `close.ts` may finalize (issue refund / complete remedy).
- **`CANCELABLE_RETURN_STATUSES`** — `[approved]`. The only status from which `cancel.ts` may void an approved-but-not-received return.
- **`initialStatusFor(reason, byStaff?)`** — Returns the opening status: `approved` for withdrawals or staff-initiated returns, `requested` otherwise. Used by `create.ts`.
- **`QUANTITY_HOLDING_RETURN_STATUSES`** — `[requested, approved, received, closed]`. Statuses whose goods still "occupy" a unit against the order line's returnable quantity.
- **`BACK_RETURN_STATUSES`** — `[received, closed]`. Statuses in which the goods are considered back at the shop (relevant to refund/delivery calculations).
- **`handsUnitsBack(returned)`** — Predicate: `true` when the remedy is `replace` or `repair`, meaning the buyer retains a unit.
- **`holdsReturnedGoods(returned)`** — Composite predicate: `true` when the return is of kind `return`, its status is in `QUANTITY_HOLDING_RETURN_STATUSES`, *and* it did not hand a unit back. Used to decide whether a prior return reduces the quantity available for a new return.

## Relationships

- **`src/types/index.ts`** — Sole import source; supplies the four domain types this file re-exports and references.
- **`src/modules/returns/domain/index.ts`** — Barrel file that re-exports this module's public surface for other domain and service files.
- **`src/modules/returns/services/decide.ts`** — Reads `DECIDABLE_RETURN_STATUSES` as the precondition for approve/decline writes.
- **`src/modules/returns/services/receive.ts`** — Reads `RECEIVABLE_RETURN_STATUSES` as the precondition for the goods-received write.
- **`src/modules/returns/services/close.ts`** — Reads `CLOSABLE_RETURN_STATUSES` as the precondition for the close write.
- **`src/modules/returns/services/cancel.ts`** — Reads `CANCELABLE_RETURN_STATUSES` as the precondition for the cancel write.
- **`src/modules/returns/services/create.ts`** — Calls `initialStatusFor` to determine the opening status of a new return.
- **`src/modules/returns/domain/accounting.ts`** — Consumes `QUANTITY_HOLDING_RETURN_STATUSES`, `BACK_RETURN_STATUSES`, and `holdsReturnedGoods` for returnable-quantity and refund calculations.
- **`src/modules/returns/domain/refund-amount.ts`** — Uses `BACK_RETURN_STATUSES` / `handsUnitsBack` to determine whether a delivery refund or remedy adjustment applies.
- **`src/modules/returns/domain/status-projection.ts`** — References the status constants to project display status from the raw record.
- **`src/modules/returns/tests/unit/domain.test.ts`** — Unit-tests the transition guards and predicate functions.

## Notes

- **Arrays are the guard, not documentation.** The module docblock explicitly states that membership in these arrays *is* the conditional-write predicate enforced in the database. Adding or removing a status from an array changes runtime concurrency behavior, not just docs.
- **`RECEIVABLE_RETURN_STATUSES` and `CANCELABLE_RETURN_STATUSES` both contain only `approved`,** but they authorize different operations. Do not conflate them or "unify" them.
- **`initialStatusFor` short-circuits on `byStaff`:** a staff-opened return is `approved` regardless of reason (even non-withdrawal reasons), because opening it *is* the decision.
- **`handsUnitsBack` inspects `remedy`, not `status`.** A `received`/`closed` return whose remedy is `replace` or `repair` does **not** count as "goods back" for guarantee-quantity purposes.
- **`canceled` is intentionally absent** from both `QUANTITY_HOLDING_RETURN_STATUSES` and `BACK_RETURN_STATUSES`: a canceled return is treated as never having spoken for any unit.
