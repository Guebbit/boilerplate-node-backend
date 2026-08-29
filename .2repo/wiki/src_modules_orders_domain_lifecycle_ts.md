# src/modules/orders/domain/lifecycle.ts

## Purpose

Defines the order status transition graph: which status may follow which, and which actor (`customer`, `admin`, `system`) is permitted to make each move. It separates the *decision* (which transitions are legal) from the *enforcement* (the repository's atomic write), and provides a single source of truth for both server-side validation and the `OrderActions` shape a client renders from.

## Key elements

- **`OrderActor`** — union type `'customer' | 'admin' | 'system'`. `system` is narrower than `admin`, not a higher rank.
- **`ORDER_LIFECYCLE`** — total `Record<OrderStatus, …>` mapping each status to the target statuses and the actors allowed on that edge. Being total over `OrderStatus` means a new contract status that lacks an entry is a compile error.
- **`canTransition(from, to, actor)`** — single-move check. Returns `true` when `from === to` (a no-op write is not a transition).
- **`statusesReachableFrom(from, actor)`** — forward lookup: all target statuses the actor may move to from `from`.
- **`statusesLeadingTo(to, actor)`** — backward lookup: all source statuses the actor may come from to reach `to`. This is the `from` set handed to `updateStatusIfIn`.
- **`orderActionsFor(status, actor)`** — assembles the contract's `OrderActions` object (`transitions`, `cancel`, `pay`) from one reading of the table so the shape a client sees and the shape the server enforces cannot diverge.

## Relationships

- **`src/types/index.ts`** — source of the `OrderStatus` enum (generated from `openapi.yaml`) and the `OrderActions` type this module fills.
- **`src/modules/orders/repository.ts`** — `updateStatusIfIn` consumes the `from` set produced by `statusesLeadingTo`; this file only decides which set to pass.
- **`src/modules/orders/domain/index.ts`** — barrel re-export of this module's public API.
- **`src/modules/orders/tests/unit/lifecycle.test.ts`** — unit tests covering the transition table and helper functions.
- **`docs/theory/tactical-ddd.md`** — §1 is cited in the file header as the rationale for this separation of concerns.

## Notes

- `canTransition` deliberately returns `true` for `from === to`. `orderActionsFor` therefore uses `statusesReachableFrom` (which excludes the current status) for the `transitions` and `cancel` fields, but still calls `canTransition` for `pay` — a different question ("is paying still possible?") that needs the no-op tolerance.
- The `pay` field is queried as the `system` actor (no client-initiated request makes that move) and additionally guards `status !== OrderStatus.paid` to avoid offering payment on an already-paid order.
- Terminal states (`delivered`, `cancelled`) carry an explicit `{}` rather than an omitted key, so an accidental omission is distinguishable from a deliberate terminal.
