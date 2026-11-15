---
source: src/modules/returns/domain/lifecycle.ts
sha256: cd4aa4c4d961ccd35c5fa37dd77187ae537d7571def012e6937124dd51c128be
generated_at: 2026-11-14T21:33:19.761989+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/domain/lifecycle.ts

## Purpose

Defines the return-state machine: which status each move may start from and where it lands. The table doubles as the guard for the conditional writes in `repository.ts` (`claimStatus`), making concurrent approvals/declines a database-level race where exactly one wins.

## Key elements

- **`ReturnEvent`** — union of the five moves: `approve`, `decline`, `receive`, `cancel`, `close`.
- **`RETURN_EVENTS`** — const table mapping each event to `{ from, to }` statuses. Satisfies `Record<ReturnEvent, LifecycleEvent<ReturnStatus>>`.
- **`returnLifecycle`** — the lifecycle instance built via `defineLifecycle`, checked once at load. Exposes the validated state machine for runtime queries.
- **`initialStatusFor(reason, byStaff?)`** — determines the *birth* status (not a move): `approved` for withdrawals or staff-opened returns; `requested` otherwise.
- **`QUANTITY_HOLDING_RETURN_STATUSES`** — readonly array of statuses where goods have not yet come back and still count against an order line's returnable quantity.
- **`BACK_RETURN_STATUSES`** — readonly array (`received`, `closed`) marking statuses where goods count as returned.
- **`handsUnitsBack(returned)`** — predicate: true when the remedy is `replace` or `repair`, meaning the unit goes back to the buyer and stays returnable.
- **`holdsReturnedGoods(returned)`** — predicate: true when a `return`-kind record is in a quantity-holding status and did not hand the unit back to the buyer.
- **Re-exports** — `ReturnStatus`, `ReturnReason`, `ReturnKind`, `ReturnRemedy` (pass-through from `@types`).

## Relationships

- **`src/domain-primitives/lifecycle.ts`** — provides `defineLifecycle` and the `LifecycleEvent` type that shape `RETURN_EVENTS`.
- **`src/modules/returns/repository.ts`** — `claimStatus` performs the conditional writes that this table guards; the `from` arrays are the WHERE-clause status sets.
- **`src/modules/returns/services/*.ts`** (`cancel`, `close`, `create`, `decide`, `options`, `proof`, `read`, `receive`) — each service corresponds to one lifecycle event (or the birth step) and reads the table / `returnLifecycle` to validate transitions before calling the repository.
- **`src/modules/returns/domain/accounting.ts`** — consumes `QUANTITY_HOLDING_RETURN_STATUSES` and `holdsReturnedGoods` to compute returnable-quantity deductions.
- **`src/modules/returns/domain/refund-amount.ts`** — uses `BACK_RETURN_STATUSES` to decide whether delivery-refund logic applies.
- **`src/modules/returns/domain/index.ts`** — barrel file re-exporting this module's public surface.

## Notes

- The transition table is the authoritative guard, not documentation. If a status pair is missing from `from`, the write simply fails at the database level.
- Birth status is deliberately *not* modeled as an event — it is set at insertion time by `initialStatusFor`, called from `create.ts` (and the withdrawal/cancel-remainder paths).
- `canceled` is excluded from both `QUANTITY_HOLDING_RETURN_STATUSES` and `BACK_RETURN_STATUSES` on purpose: a canceled return is treated as if it never happened, so its units are neither held nor counted as returned.
- A withdrawal is born `approved` (EU consumer right, no staff decision needed); every other reason starts `requested` unless staff opened it, in which case opening it is the approval.
