---
source: src/modules/orders/tests/unit/lifecycle.test.ts
source_sha256: 064e31750e2fbd1aba05aca39a4e29d2b222956282848394b86ef62c3e13720a
context_sha256: 93dc836f5e13a0514cd9a89e3dfba9b99ac7430fcae2ec1f6b0abdb52fb4dea2
generated_at: 2026-11-22T06:36:37.880116+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/lifecycle.test.ts

## Purpose
Pure unit tests (no mocks, no database) for the order lifecycle in `src/modules/orders/domain/lifecycle.ts`. Per its header, the tests assert the *sentences* the transition table encodes (who may write which status, what is terminal, which direction is allowed) rather than restating the table row by row, so a mis-copied table can't pass against an equally mis-copied expectation.

## Key elements
- **Test fixtures**
  - `EVERY_STATUS`: `Object.values(OrderStatus)`, so new statuses are covered automatically.
  - `EVERY_ACTOR`: `customer`, `admin`, `system`, `withdrawal`.
  - `REQUEST_ACTORS`: `customer` and `admin`, the two actors an HTTP caller can be.
  - `FULFILLMENT_SEQUENCE`: pending → paid → processing → shipped → delivered. Cancellation is not on it.
- **`describe` blocks**
  - *Table names only the contract's statuses*: every event uses declared statuses, has at least one actor and one origin, never lands on the status it leaves, and leaves `canceled` through no event. `delivered` is left only via `reship`.
  - *Named events*: `ship`, `deliver` and `fulfillmentComplete` (the digital `processing → delivered` edge, system-only). `UNDELIVERABLE_EVENT` stays outside the actor table, so system cancels stay on `pending`. `expire` leaves only `pending`.
  - *Who may write `paid` / `processing` / `shipped` / `delivered`*: only `system` reaches them, from specific origin statuses, and `admin` is refused a manual write.
  - *Who may cancel*:
    - `customer`: `pending` and `paid`.
    - `admin` and `withdrawal`: `pending`, `paid` and `processing`.
    - `system`: `pending` only (the "B21 race").
    - Nobody may cancel `shipped`.
  - *Terminal states*: nobody leaves `canceled`; only `system` leaves `delivered`, back to `processing`.
  - *Direction*: a property check that the only backward edges along the fulfillment sequence are `system: shipped → processing` (`reopen`) and `system: delivered → processing` (`reship`). `canOverrideTo` refuses both.
  - *`canTransition`*: no-op writes (`status → status`) are refused for every status and actor. The visible content ends partway through this block.

## Relationships
- Imports from `src/modules/orders/domain/lifecycle.ts`: `ORDER_EVENTS`, `UNDELIVERABLE_EVENT`, `canTransition`, `canOverrideTo`, `statusesLeadingTo`, `statusesReachableFrom`, the types `OrderActor` and `OrderEvent`, and other predicates and helpers. These include `isPayable`, `canProcessOrder`, `isAwaitingGoods`, `canShip`, `canRecordArrival`, `hasShopStarted`, `orderActionsFor`, `paymentSettled` and `overridableTargetsFrom`. Of these, only the first group is visibly exercised in the shown portion.
- Imports `OrderStatus` from `@types` (`src/types/index.ts`) and uses it as the source of truth for the status set.

## Notes
- Comments point to `src/modules/orders/services/status.ts`: `shipped`, `delivered` and `processing` are written by `system` only after `delivery` records the fact, and the generic `PUT /orders/:id` never carries `status`.
- Admin override (`override:Order`, step-up) is described as the only reachable manual path onto `processing`.
