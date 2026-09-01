# src/modules/orders/domain/lifecycle.ts

## Purpose

Defines the order state machine: which status transitions are legal, and which actor (`customer`, `admin`, or `system`) may initiate each one. It does not execute transitions—`updateStatusIfIn` in the repository does that—but supplies the `from`-set and actor checks that make the write safe and correct.

## Key elements

- **`OrderActor`** — Union type `'customer' | 'admin' | 'system'`. `system` means "moves no human request can make" (e.g., payment confirmation), not a privilege level above admin.
- **`ORDER_LIFECYCLE`** — Total `Record<OrderStatus, …>` mapping each status to a map of allowed target statuses → permitted actors. Terminal states (`delivered`, `cancelled`) map to `{}`. Adding a new `OrderStatus` without a key here is a compile error.
- **`canTransition(from, to, actor)`** — Returns `true` if the move is allowed, or if `from === to` (a no-op write, not a transition).
- **`statusesReachableFrom(from, actor)`** — All statuses the actor may move *to* from `from`, in `OrderStatus` enumeration order. Excludes `from` itself.
- **`statusesLeadingTo(to, actor)`** — All statuses that may *precede* `to` for the given actor. Designed to feed `updateStatusIfIn`'s `from` parameter.
- **`orderActionsFor(status, actor)`** — Returns an `OrderActions` object (`{ transitions, cancel, pay }`) shaped for client-side UI rendering. `pay` is computed against the `system` actor and is independent of `transitions`.

## Relationships

- **`src/types/index.ts`** — Provides `OrderStatus` (the enum the lifecycle is total over) and the `OrderActions` return type.
- **`src/modules/orders/domain/index.ts`** — Barrel re-export; consumers of the `domain` module pull these symbols through it.
- **`src/modules/orders/service.ts`** — Calls `canTransition` / `orderActionsFor` to guard writes and build API responses.
- **`src/modules/payments/service.ts`** — Triggers the `pending → paid` transition, the only edge whose actor is `system`; interacts via `canTransition` or `statusesLeadingTo`.
- **`src/modules/orders/tests/unit/lifecycle.test.ts`** — Unit tests covering every edge, the `from === to` shortcut, and `orderActionsFor` output shapes.

## Notes

- `canTransition` intentionally returns `true` when `from === to`. Use `statusesReachableFrom` (or `orderActionsFor`) when you need to exclude the current status—e.g., "may I cancel this already-cancelled order?" should be `false`.
- The `pay` field in `orderActionsFor` is queried against the `system` actor, so it will never appear in `transitions` (which are filtered by the *requesting* actor). It exists so a client can decide whether to show a card form.
- The `ORDER_LIFECYCLE` table is the single source of truth for edges and actor permissions. Do not duplicate transition logic elsewhere; add new edges here.
- Status order in return arrays follows `Object.values(OrderStatus)` (contract/enum declaration order), not alphabetical.
