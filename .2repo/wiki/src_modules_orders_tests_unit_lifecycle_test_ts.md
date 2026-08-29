# src/modules/orders/tests/unit/lifecycle.test.ts

## Purpose

Unit tests for the order lifecycle state machine in `src/modules/orders/domain/lifecycle.ts`. They assert the invariants (sentences) the transition table encodes—totality, direction, terminality, actor permissions—rather than restating individual rows. Pure and synchronous: no mocks, no database.

## Key elements

- **Constants** — `EVERY_STATUS` (all `OrderStatus` values), `EVERY_ACTOR` (`customer | admin | system`), `REQUEST_ACTORS` (excludes `system`), `FULFILMENT_SEQUENCE` (the linear `pending → paid → processing → shipped → delivered` path).
- **`the table is total over the contract`** — Verifies the table covers every declared status, references only declared destinations, and every edge has ≥ 1 actor.
- **`who may write paid`** — Only `system` may transition into `paid`; `admin` is explicitly refused.
- **`who may cancel`** — Customer: `pending` + `paid`. Admin: adds `processing`. No one: `shipped` or beyond.
- **`terminal states`** — `delivered` and `cancelled` have zero outgoing edges for every actor; reopening is refused.
- **`direction`** — Property test: no edge moves backwards along `FULFILMENT_SEQUENCE` for any actor.
- **`canTransition`** — Self-transition always allowed; `statusesReachableFrom` and `statusesLeadingTo` are verified as exact inverses.
- **`orderActionsFor`** — `transitions` agrees with the table; `cancel` is false on an already-cancelled order; `pay` flag is true only on `pending` and never leaks `paid` into `transitions` for request actors; `pay` withdrawn on `paid`, `delivered`, `cancelled`.

## Relationships

- **`src/modules/orders/domain/lifecycle.ts`** — The module under test. Provides `ORDER_LIFECYCLE`, `canTransition`, `orderActionsFor`, `statusesLeadingTo`, `statusesReachableFrom`, and the `OrderActor` type.
- **`src/types/index.ts`** (imported as `@types`) — Source of the `OrderStatus` enum used to enumerate every status in assertions.

## Notes

- Testing philosophy (stated in the file header): assertions target the *sentences* the table implies, not row-by-row equality, to avoid a copied-table-and-copied-expectation false pass.
- `system` is excluded from `REQUEST_ACTORS` because it represents moves triggered by external facts (e.g., a payment webhook), not an HTTP caller.
- `canTransition` returns `true` for self-transitions (a no-op write). `orderActionsFor.cancel` deliberately overrides this for an already-cancelled order—`canTransition` is "is this write legal?" while `cancel` is "should the UI offer it?".
- Theory rationale for each rule group is pointed to in `docs/theory/tactical-ddd.md` §1.
