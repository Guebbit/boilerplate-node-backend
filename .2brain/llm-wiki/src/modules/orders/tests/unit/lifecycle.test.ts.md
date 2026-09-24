---
source: src/modules/orders/tests/unit/lifecycle.test.ts
sha256: 716900d2322837e61e86688f4c7b106a7b0cbc35de19d5c849baf759ac88e1cd
generated_at: 2026-09-23T19:14:13.418753+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/lifecycle.test.ts

## Purpose

Unit tests for the order-lifecycle state table and its derived query functions. The file exists to assert the _rules_ the table encodes (who may move an order where, under what conditions) rather than restating individual rows, so that a copy-paste error in the table itself would be caught. All tests are pure — no mocks, no database.

## Key elements

- **`EVERY_STATUS` / `EVERY_ACTOR` / `REQUEST_ACTORS`** — Constants enumerating the full status set, all three actors (`customer`, `admin`, `system`), and the two actors reachable via HTTP. Used to drive property-style checks across the whole table.
- **`FULFILMENT_SEQUENCE`** — The happy-path status chain (`pending → paid → processing → shipped → delivered`); used to assert no backwards edge exists.
- **`describe('the table is total over the contract')`** — Verifies `ORDER_LIFECYCLE` covers every declared status, names only declared destinations, and gives every edge at least one actor.
- **`describe('who may write paid' / 'shipped' / 'delivered')`** — Pins that these statuses are reachable _only_ via the `system` actor (i.e., an external fact), and that no human actor may write them directly.
- **`describe('who may cancel')`** — Asserts the per-actor cancellation window (customer: pending+paid; admin: pending+paid+processing) and that `shipped` is never cancellable.
- **`describe('terminal states')`** — Confirms `delivered` and `cancelled` have no outgoing edges for any actor; explicitly rejects reopening.
- **`describe('direction')`** — Property test that no edge in the table moves backwards along the fulfilment sequence.
- **`describe('canTransition')`** — Tests idempotent self-writes, the exception for `paid`, the inverse relationship between `statusesReachableFrom` and `statusesLeadingTo`, and literal forward-direction pins.
- **`describe('isPayable')`** — Confirms only `pending` is payable and that the `paid→paid` echo write is not surfaced as "payable."
- **`describe('orderActionsFor')`** — Verifies the action bundle agrees with the table, pins literal expected payloads, ensures `cancel` is never advertised on an already-cancelled order, and that `pay` is a _hint_ (not a transition) for request actors.

## Relationships

- **`src/modules/orders/domain/lifecycle.ts`** — The sole unit under test. Every `describe` block exercises one or more of its exports: `ORDER_LIFECYCLE`, `canTransition`, `canOverrideTo`, `statusesOverridableInto`, `isPayable`, `orderActionsFor`, `statusesLeadingTo`, `statusesReachableFrom`, and the `OrderActor` type.
- **`src/types/index.ts`** — Provides the `OrderStatus` enum, which the tests iterate over (`EVERY_STATUS`) and use as literal anchors in expected values.

## Notes

- **Testing philosophy (stated in the file header):** Tests assert _sentences_ the table encodes, not individual rows. Restating rows would pass against a table that was copied wrong because the copy and the expectation share the same mistake.
- **Self-agreement vs. literal pinning:** Several tests check that two functions agree with each other (e.g., `statusesReachableFrom` vs. `statusesLeadingTo`). Because both route through the same underlying `canTransition`, these only catch wiring bugs. The file compensates by also asserting _literal_ expected values for known statuses to pin the table itself.
- **`system` is not an HTTP actor:** `REQUEST_ACTORS` excludes `system`; tests that concern the HTTP surface (e.g., "no request may claim `paid`") iterate only over `REQUEST_ACTORS`.
- **`paid` is special-cased** in multiple places: echo-writes onto `paid` are refused for non-system actors, `isPayable` excludes `paid`, and `orderActionsFor` keeps `paid` out of the `transitions` array even when `pay` is `true`.
- **References outside the test:** The header points to `docs/theory/tactical-ddd.md` §1 for the rationale behind each rule; inline comments reference `src/modules/orders/services/status.ts` as the sole service allowed to perform the `shipped`/`delivered` moves.
