---
source: src/modules/orders/tests/unit/lifecycle.test.ts
sha256: 16e84597db59ca1da006655d0640ed3c231519a76d3ebf8b1c8fcbf55789a29c
generated_at: 2026-11-14T20:57:18.736284+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/lifecycle.test.ts

## Purpose

Unit tests for the order-lifecycle transition table. Rather than re-listing every row (which would pass against a table copied wrong), the suite asserts the *properties* the table must satisfy: actor permissions per status, terminal-state immutability, forward-only direction, and the agreement between `canTransition` and the table's inverse lookups. Pure—no mocks, no database.

## Key elements

- **`EVERY_STATUS`** – derived from `Object.values(OrderStatus)` so a new enum member is covered automatically.
- **`EVERY_ACTOR` / `REQUEST_ACTORS`** – the four actors (`customer`, `admin`, `system`, `withdrawal`) and the two an HTTP caller can be.
- **`FULFILLMENT_SEQUENCE`** – the forward path `pending → paid → processing → shipped → delivered`; used to assert no actor may move backwards.
- **`describe("the table names only the contract's statuses")`** – structural integrity: every `from`/`to` is a declared status, every event has ≥ 1 actor and origin, no self-loops, `canceled` is a dead-end, `delivered` exits only via `reship`.
- **`describe('the named events')`** – pins the exact shape of `ship`, `deliver`, `fulfillmentComplete`, `UNDELIVERABLE_EVENT`, and `expire`.
- **`describe('who may write …')`** – per-status actor gates (`paid`, `processing`, `shipped`, `delivered`); asserts only `system` (via recorded external facts) can reach them.
- **`describe('who may cancel')`** – customer / admin / withdrawal / system cancellation windows; shipped goods are never cancelable.
- **`describe('terminal states')`** – `canceled` is fully terminal; `delivered` exits only for a system `reship`; reopening is refused for every non-system actor.
- **`describe('direction')`** – a property test over the full table verifying the only backward edges are `reopen` (shipped→processing) and `reship` (delivered→processing), both system-only and non-overridable.
- **`describe('canTransition')`** – self-transitions always refused; `canTransition` agrees with both `statusesLeadingTo` and `statusesReachableFrom` for every (actor, from, to) triple.

## Relationships

- **`src/modules/orders/domain/lifecycle.ts`** – the module under test. All assertions reference its exports: `ORDER_EVENTS`, `UNDELIVERABLE_EVENT`, `canTransition`, `canOverrideTo`, `isPayable`, `canProcessOrder`, `isAwaitingGoods`, `canShip`, `canRecordArrival`, `hasShopStarted`, `orderActionsFor`, `statusesLeadingTo`, `statusesReachableFrom`, `paymentSettled`, `overridableTargetsFrom`, and the `OrderActor` / `OrderEvent` types.
- **`src/types/index.ts`** – provides `OrderStatus`, the contract enum. The test derives `EVERY_STATUS` from it so a new status is picked up without editing this file.

## Notes

- The file intentionally avoids row-by-row restatement; the header comment and `docs/theory/tactical-ddd.md` §1 explain why (a wrong table would fail a property test but pass a copy-paste test).
- Comments reference `src/modules/orders/services/status.ts` (`markProcessing`, delivery doors) to explain *why* certain actors are excluded—useful when reading the domain module in isolation.
- `REQUEST_ACTORS` is declared but only used implicitly; the distinction between request-actors and `system`/`withdrawal` actors is the core permission model under test.
- The `canTransition` bidirectional-agreement test iterates the full Cartesian product of status × actor, making it O(n²) in the enum size—acceptable given the small, stable enum.
