---
source: src/modules/orders/tests/unit/lifecycle.test.ts
sha256: 758de616a6dc3c4275bbe895156caec0c2a31844d68be6aa2dbf08881287a5f1
generated_at: 2026-11-08T07:12:42.652480+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/lifecycle.test.ts

## Purpose

Unit tests for the order-lifecycle state machine (`domain/lifecycle.ts`). The file asserts the *sentences* the transition table encodes—actor permissions, terminality, direction, and consistency—rather than re-listing rows. This catches structural violations (a new edge in the wrong direction, a status that silently becomes reachable by the wrong actor) without the expectation repeating the table's own mistake. Pure: no mocks, no database.

## Key elements

- **`EVERY_STATUS`** — derived from `Object.values(OrderStatus)` so a new enum member is covered automatically.
- **`EVERY_ACTOR` / `REQUEST_ACTORS`** — the full actor set and the two actors an HTTP caller can be.
- **`FULFILLMENT_SEQUENCE`** — the forward fulfillment line (`pending → paid → processing → shipped → delivered`) used by the direction test.
- **`describe("the table names only the contract's statuses")`** — validates table well-formedness: no undeclared statuses, no self-loops, every event has actors and origins, `canceled` is terminal, `delivered` is left only by `reship`.
- **`describe('the named events')`** — pins specific edges (`ship`, `deliver`, `fulfillmentComplete`, `UNDELIVERABLE_EVENT`, `expire`) and their actor/origin constraints.
- **`describe('who may write …')` blocks** — for each status (`paid`, `processing`, `shipped`, `delivered`), assert that only the `system` actor can reach it and that admin hand-writes are refused.
- **`describe('who may cancel')`** — encodes the per-actor cancelable sets (customer stops at `paid`, admin/withdrawal go one step further, system only cancels `pending`, nobody cancels `shipped`).
- **`describe('terminal states')`** — `canceled` is fully terminal; `delivered` is left only by system `reship`; reopening is refused.
- **`describe('direction')`** — property test over all actor×status pairs proving no backward edge exists except the two system-only `reopen`/`reship` edges.
- **`describe('canTransition')`** — self-transitions are always false; `canTransition` is the exact inverse of `statusesLeadingTo` / `statusesReachableFrom`.

## Relationships

- **`src/modules/orders/domain/lifecycle.ts`** — the module under test. All exported functions (`canTransition`, `statusesLeadingTo`, `statusesReachableFrom`, `canOverrideTo`, `isPayable`, `canProcessOrder`, `isAwaitingGoods`, `canShip`, `canRecordArrival`, `hasShopStarted`, `orderActionsFor`, `paymentSettled`, `overridableTargetsFrom`) and constants (`ORDER_EVENTS`, `UNDELIVERABLE_EVENT`) imported here are exercised by the assertions.
- **`src/types/index.ts`** — provides the `OrderStatus` enum. The test derives `EVERY_STATUS` from it, so adding a new status to the contract automatically widens every universal-quantifier test without touching this file.

## Notes

- The file deliberately avoids row-by-row assertions. A new or changed edge in `lifecycle.ts` is caught by the *property* tests (direction, terminality, actor exclusivity) even if no one adds a dedicated case.
- `REQUEST_ACTORS` is defined but only used in comments/annotations; the active assertions iterate over `EVERY_ACTOR`.
- The `canTransition` inverse test is cut off in the source (truncation), but its intent—mutual consistency with the `statusesLeadingTo`/`statusesReachableFrom` helpers—is clear from the comment.
- Comments reference `docs/theory/tactical-ddd.md` §1 and `src/modules/orders/services/status.ts` for the runtime enforcement path; those are the *callers* that must respect the table this file locks down.
