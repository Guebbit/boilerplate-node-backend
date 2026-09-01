# src/modules/orders/tests/unit/lifecycle.test.ts

## Purpose

Unit tests for the order-lifecycle state machine (`ORDER_LIFECYCLE` table and its query helpers). Instead of asserting individual rows, the suite encodes *sentences*—invariant properties over the whole table—so that a table copied with the same mistake in both the fixture and the expectation still fails.

## Key elements

- **`EVERY_STATUS`** – `Object.values(OrderStatus)`; the full set of declared statuses.
- **`EVERY_ACTOR`** – `['customer', 'admin', 'system']`; all actors the table recognises.
- **`REQUEST_ACTORS`** – `['customer', 'admin']`; the two actors reachable over HTTP (excludes `system`).
- **`FULFILMENT_SEQUENCE`** – the happy-path linear chain `pending → paid → processing → shipped → delivered`, used to assert no backwards edge exists.
- **`describe('the table is total over the contract')`** – exhaustiveness: every `OrderStatus` appears as a key, every destination is a declared status, every edge has ≥ 1 actor.
- **`describe('who may write paid')`** – only `system` (payment webhook) can transition into `paid`; `admin` and `customer` cannot.
- **`describe('who may cancel')`** – cancellation reachability per actor; shipped goods are never cancellable by anyone.
- **`describe('terminal states')`** – `delivered` and `cancelled` have zero outgoing edges; re-opening is explicitly refused.
- **`describe('direction')`** – property-based check that no edge moves backwards along `FULFILMENT_SEQUENCE`.
- **`describe('canTransition')`** – self-transition is allowed (idempotent write); `canTransition` is the logical inverse of `statusesReachableFrom` / `statusesLeadingTo`.
- **`describe('orderActionsFor')`** – the API-facing action object agrees with the table; `pay` is advertised but never listed in `transitions` for request actors; `cancel` is hidden on already-cancelled orders.

## Relationships

- **`src/modules/orders/domain/lifecycle.ts`** – the module under test. Imports `ORDER_LIFECYCLE`, `canTransition`, `orderActionsFor`, `statusesLeadingTo`, `statusesReachableFrom`, and the `OrderActor` type.
- **`src/types/index.ts`** – source of the `OrderStatus` enum used to enumerate all statuses and build `EVERY_STATUS`.

## Notes

- The file header explicitly warns: asserting row-by-row would pass against a table copied wrong because both the data and the expectation repeat the same mistake. All assertions are therefore whole-table invariants.
- `canTransition(status, status, actor)` is **intentionally** `true` for every actor (idempotent re-write), but `orderActionsFor` correctly suppresses `cancel` when the order is already cancelled—two different callers, two different contracts.
- `pay` is a *hint* for the client (render a card form), not a transition the client may execute. It appears in `actions.pay` but never in `actions.transitions` for `REQUEST_ACTORS`.
- References `docs/theory/tactical-ddd.md` §1 for the rationale behind each rule.
