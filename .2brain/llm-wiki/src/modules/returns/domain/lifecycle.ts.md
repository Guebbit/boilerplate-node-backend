---
source: src/modules/returns/domain/lifecycle.ts
source_sha256: dc8178287ed7789b7ca58deb1d950d5f490f5ff6531c063c73e1f030935a6782
context_sha256: 97f3e2d89f9913a5dad7209276017e32294b55cb46abd8f122865e4aea51fc6b
generated_at: 2026-11-22T07:23:10.705902+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/domain/lifecycle.ts

## Purpose
Defines the return lifecycle: which status each move (`approve`, `decline`, `receive`, `cancel`, `close`) may start from and where it ends up. Each move backs a conditional write (`claimStatus` in `repository.ts`), so the table is the actual concurrency guard. If two staff members approve and decline the same request at once, exactly one wins in the database. The file also holds the status groupings and predicates used for returnable-quantity accounting.

## Key elements
- `ReturnStatus`, `ReturnReason`, `ReturnKind`, `ReturnRemedy`: type re-exports from `@types`. The sets are closed and come from the contract. This file adds only the transition rules.
- `ReturnEvent`: the union `'approve' | 'decline' | 'receive' | 'cancel' | 'close'`.
- `RETURN_EVENTS`: the transition table, one `{ from, to }` entry per event, checked with `satisfies Record<ReturnEvent, LifecycleEvent<ReturnStatus>>`:
  - `approve`: requested → approved
  - `decline`: requested → declined
  - `receive`: approved → received
  - `cancel`: approved → canceled
  - `close`: received → closed
- `returnLifecycle`: the table passed to `defineLifecycle(...)`, with `initial: requested`. The table is checked once at load.
- `initialStatusFor(reason, byStaff = false)`: the birth status of a goods return. It returns `approved` for a `withdrawal` or when staff opened it, and `requested` otherwise.
- `QUANTITY_HOLDING_RETURN_STATUSES`: `requested`, `approved`, `received`, `closed`. These count against an order line's returnable quantity. `declined` and `canceled` do not.
- `BACK_RETURN_STATUSES`: `received`, `closed`. These are the statuses at which goods count as back.
- `handsUnitsBack(returned)`: true when the remedy is `replace` or `repair`, because the buyer has a unit again.
- `holdsReturnedGoods(returned)`: true when `kind` is `return`, the status is quantity-holding, and the return did not hand units back.

## Relationships
- `src/domain-primitives/lifecycle.ts`: supplies `defineLifecycle` and the `LifecycleEvent` type.
- `src/modules/returns/repository.ts`: its `claimStatus` conditional write uses the sets derived from the table.
- `src/modules/returns/services/create.ts`: calls `initialStatusFor` to set the birth status.
- The other services (`decide.ts`, `receive.ts`, `cancel.ts`, `close.ts`) are named after the events in the table, so each move maps to a door.
- Within `domain/`, the accounting, refund-amount, statement and status-projection files are neighbors. This file's status groups and predicates are what the quantity and accounting rules build on.

## Notes
- Birth is not a move. `initialStatusFor` is separate from the event table, and the lifecycle's `initial` is only the status of a request.
- A pre-dispatch withdrawal never reaches `initialStatusFor`. `withdraw.ts` writes it directly as `closed`.
- `cancel` is only valid from `approved`. A `requested` return is declined with a reason code instead, and a `received` return is closed.
- `canceled` is deliberately excluded from `BACK_RETURN_STATUSES`: a canceled return never happened. Cancellations have their own accounting, because their units never shipped.
- Replace and repair remedies keep a unit returnable under the guarantee, so `holdsReturnedGoods` excludes them.
