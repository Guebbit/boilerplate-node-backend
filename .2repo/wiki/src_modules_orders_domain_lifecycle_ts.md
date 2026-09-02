# src/modules/orders/domain/lifecycle.ts

## Purpose

Defines the order-status state machine: which status may follow which, and which actor (`customer`, `admin`, `system`) is permitted to make each move. The status *set* is generated from a shared contract; this file adds the directed edges and per-edge actor authorization, producing a single source of truth that the service layer, repository helpers, and client-facing action queries all consult.

## Key elements

- **`OrderActor`** (type) — the three roles that can trigger a transition: `'customer' | 'admin' | 'system'`. `system` is narrower than `admin`, not above it: it covers moves no human may make by hand (e.g. the payment webhook).
- **`ORDER_LIFECYCLE`** (const) — a total `Record<OrderStatus, …>` mapping each status to the transitions it allows, with the authorized actors attached to each edge. Terminal states (`delivered`, `cancelled`) carry `{}`. Totality means a new contract status is a compile-time error, not a silent dead-end.
- **`canTransition(from, to, actor)`** (fn) — core gate. Returns `true` if the move is legal. `from === to` (no-op / echo write) is allowed **except** when `to === 'paid'`, where only `system` may pass.
- **`statusesReachableFrom(from, actor)`** (fn) — the subset of statuses the actor may move *to* from `from` (excludes `from` itself). Intended as the payload for a 409 response's "what you *can* do" list.
- **`statusesLeadingTo(to, actor)`** (fn) — the subset of statuses from which `to` is reachable by `actor`. Feeds the `from` set handed to `updateStatusIfIn` in the repository for optimistic-concurrency writes.
- **`orderActionsFor(status, actor)`** (fn) — returns an `OrderActions` object (`transitions`, `cancel`, `pay`) shaped for client-side rendering. `cancel` is derived from `statusesReachableFrom` (so an already-cancelled order reports `cancel: false`). `pay` is evaluated from the `system` actor's perspective and is `true` only when `pending → paid` is still possible.

## Relationships

- **`src/types/index.ts`** — supplies `OrderStatus` and `OrderActions`; this file imports both and its map keys/values are typed against them.
- **`src/modules/orders/service.ts`** — calls `canTransition`, `statusesLeadingTo`, and `orderActionsFor` to gate writes and build API responses.
- **`src/modules/orders/domain/index.ts`** — barrel re-export; external code imports the lifecycle API through the domain folder rather than this file directly.
- **`src/modules/payments/service.ts`** — the "system" actor path: when a payment webhook fires it transitions `pending → paid`, the one edge in `ORDER_LIFECYCLE` restricted to `['system']`.
- **`src/modules/orders/tests/unit/lifecycle.test.ts`** — unit-tests every exported function against the lifecycle table.

## Notes

- **No-op into `paid` is special-cased.** `canTransition(paid, paid, 'customer')` returns `false` even though `from === to`. This prevents a client echo-write from bypassing the "only system can mark paid" invariant. `system` still gets the no-op for webhook retries.
- **`orderActionsFor` deliberately avoids `canTransition` for `cancel`.** Because `canTransition` returns `true` for `from === to`, it would report `cancel: true` on an already-cancelled order. `statusesReachableFrom` excludes the current status, which is the correct answer for "may I cancel *this*?"
- **`pay` ignores the requesting actor.** It is always evaluated as `system` because paying is never a client-initiated move; the field exists so a front-end can decide whether to show a card form.
- The module doc-comment cross-references `../repository.ts` (`updateStatusIfIn`) and `docs/theory/tactical-ddd.md §1` for the broader concurrency and DDD context.
