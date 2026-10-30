---
source: src/modules/returns/domain/lifecycle.ts
sha256: a4b9d1b9afd27adbc716acd31a9b287404c570ed06772850b5ed7af1b3fc3fe9
generated_at: 2026-10-29T05:37:24.717649+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/lifecycle.ts

## Purpose

Defines the return lifecycle's state-transition guards: which `ReturnStatus` values permit each write operation (decide, receive, close, cancel). Because each constant is consumed directly as the `FROM` clause in a conditional database write (`claimStatus`), membership in these arrays *is* the concurrency guard, not documentation. Also provides pure helpers that compute a return's initial status and whether it still "holds" a unit of goods.

## Key elements

- **Re-exported types** — `ReturnStatus`, `ReturnReason`, `ReturnKind`, `ReturnRemedy` re-exported from `@types` for downstream convenience.
- **`DECIDABLE_RETURN_STATUSES`** — `[requested]`. The only status from which staff may approve/decline.
- **`RECEIVABLE_RETURN_STATUSES`** — `[approved]`. The only status from which goods may be logged as received.
- **`CLOSABLE_RETURN_STATUSES`** — `[received]`. The only status from which the return can be finalized (refund issued).
- **`CANCELABLE_RETURN_STATUSES`** — `[approved]`. Distinct from decline: an approved return whose goods never arrived.
- **`QUANTITY_HOLDING_RETURN_STATUSES`** — `[requested, approved, received, closed]`. Statuses that still "speak for" a unit against an order line's returnable quantity.
- **`BACK_RETURN_STATUSES`** — `[received, closed]`. Statuses that count as the goods being physically back.
- **`initialStatusFor(reason, byStaff?)`** — Returns `approved` for withdrawals or staff-initiated returns; `requested` otherwise.
- **`handsUnitsBack(returned)`** — True when the remedy is `replace` or `repair` (unit returned to buyer).
- **`holdsReturnedGoods(returned)`** — True when a `return`-kind record is in a quantity-holding status *and* did not hand the unit back (i.e. it counts against new-return availability).

## Relationships

- **`@types` (`src/types/index.ts`)** — source of the four domain types re-exported here.
- **Services (`create`, `decide`, `receive`, `close`, `cancel`)** — each imports the relevant `*_STATUSES` constant and passes it as the expected-status argument to the repository's conditional write, so exactly one concurrent actor can win the transition.
- **`create.ts`** — calls `initialStatusFor` to set the status at insert time.
- **`domain/accounting.ts`** — consumes `QUANTITY_HOLDING_RETURN_STATUSES` / `holdsReturnedGoods` to compute how many units a new return may still claim.
- **`domain/refund-amount.ts`** — consults `BACK_RETURN_STATUSES` to decide whether the goods are back and the delivery refund applies.
- **`domain/status-projection.ts`** — maps the status set into user-facing projections.
- **`domain/index.ts`** — barrel re-export; makes the constants and helpers available to the module's public API.
- **`tests/unit/domain.test.ts`** — unit-tests the pure helpers and the constant arrays.

## Notes

- The constants are `readonly` arrays, not `Set`s. Membership checks use `.includes`, which is O(n) — fine for 4-element lists but not a pattern to scale.
- `CANCELABLE_RETURN_STATUSES` and `RECEIVABLE_RETURN_STATUSES` both contain `approved`; the distinction is semantic (cancel = goods never arrived, receive = goods arrived), enforced by the *service* logic, not by the status set alone.
- `handsUnitsBack` treats `replace` and `repair` as "unit is back in buyer's hands," meaning the original unit is *not* counted as returned for guarantee purposes. This is a deliberate policy choice documented in the JSDoc.
- `byStaff` defaults to `false`; the only caller path that passes `true` is a staff-initiated creation, where opening the return *is* the approval.
