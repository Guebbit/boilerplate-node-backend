# src/modules/orders/tests/unit/lifecycle.test.ts

## Purpose

Unit tests for the order-lifecycle state machine in `src/modules/orders/domain/lifecycle.ts`. The suite asserts *properties* of the `ORDER_LIFECYCLE` table (totality, direction, actor-gating, terminal immutability) rather than restating individual rows, so that a table copied wrong in both the module and its expectations is still caught. No mocks, no database — pure logic verification.

## Key elements

- **`EVERY_STATUS` / `EVERY_ACTOR` / `REQUEST_ACTORS`** — Exhaustive iteration sets. `REQUEST_ACTORS` (customer, admin) excludes `system`, which is reserved for moves triggered by external facts (e.g. payment confirmation).
- **`FULFILMENT_SEQUENCE`** — The happy-path chain `pending → paid → processing → shipped → delivered`; used by the backward-movement property test. Cancellation is deliberately absent (it exits the line).
- **`describe('the table is total over the contract')`** — Verifies the table has exactly the statuses declared in `OrderStatus`, that no unknown status appears as a destination, and that no edge has an empty actor list.
- **`describe('who may write paid')`** — Pins that only `system` may transition into (or echo) `paid`; admin/customer cannot.
- **`describe('who may cancel')`** — Asserts per-actor cancellation reachability: customer up to `paid`, admin up to `processing`, no one from `shipped`.
- **`describe('terminal states')`** — `delivered` and `cancelled` are sinks for all actors; re-opening a cancelled or delivered order is refused.
- **`describe('direction')`** — Property test: no actor may move backwards along `FULFILMENT_SEQUENCE`.
- **`describe('canTransition')`** — Covers self-transition (no-op write) permission, the `paid` self-transition exception, mutual consistency between `statusesReachableFrom` and `statusesLeadingTo`, and literal anchors for `statusesReachableFrom` (pending/admin, pending/system, paid/admin, paid/customer).
- **`describe('orderActionsFor')`** — Verifies the HTTP-facing action summary: `transitions` array, `cancel` flag, and `pay` flag. Pins that `pay` is advertised to request actors but never included in their `transitions` list, and that `cancel` is `false` on an already-cancelled order.

## Relationships

- **`src/modules/orders/domain/lifecycle.ts`** — The module under test. This file imports `ORDER_LIFECYCLE`, `canTransition`, `orderActionsFor`, `statusesLeadingTo`, `statusesReachableFrom`, and the `OrderActor` type from it.
- **`src/types/index.ts`** — Provides the `OrderStatus` enum, which defines the closed set of statuses the lifecycle table must cover.

## Notes

- The file header explicitly warns against row-by-row restatement: tests assert *sentences* (invariants) over the table, because a copy-paste error in both the table and the expectation would pass a row-level test.
- `canTransition` allows self-transitions (a no-op edit writing the current status back), **except** for `paid`, where only `system` may do so. `orderActionsFor` compensates: it reports `cancel: false` on a cancelled order even though `canTransition(cancelled, cancelled, …)` is `true`.
- `orderActionsFor` exposes a `pay` boolean that is **not** part of `transitions`; paying is a client-side affordance (show the card form), not a status write the client is permitted to perform.
- The "mutual agreement" test between `statusesReachableFrom` and `statusesLeadingTo` only proves the two wrappers are consistent *with each other* (both delegate to `canTransition`). The literal-anchor test in the same block is what pins the actual table values independently.
- See `docs/theory/tactical-ddd.md` §1 for the rationale behind each rule.
