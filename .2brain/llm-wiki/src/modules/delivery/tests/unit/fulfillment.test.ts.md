---
source: src/modules/delivery/tests/unit/fulfillment.test.ts
source_sha256: 40da6c8991fdd26728698086009d872f5293f61aa43376ceeacbcfc67ffc4422
context_sha256: e86377a6e2a0b3f239c7f36276e63b20d442646681f2f5564671fdebf791dae3
generated_at: 2026-11-22T05:04:06.560467+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/tests/unit/fulfillment.test.ts

## Purpose
Unit tests for the pure fulfillment rules in the delivery domain: how an order's lines are split into fulfillment orders, what remains of each line, which status follows from lines and hold, which lines a shipment may carry, the summary handed to `orders`, and which actions a fulfillment order offers. No I/O or database is involved; everything is tested against in-memory values.

## Key elements
- `line(productId, quantity, fields?)` — builds a `FulfillmentLine` with nothing shipped or canceled unless overridden.
- `groupable(productId, quantity, fields?)` — builds a `GroupableLine` (defaults to `ships: true`) as the grouping rule reads it.
- `describe('groupOrderLines')` — covers the grouping rule, which takes lines and a shop timezone and returns numbered drafts:
  - An ordinary order becomes one open `physical` fulfillment order. A digital-only order becomes one `digital` order. Digital lines in a mixed order stay in the physical one.
  - Each preorder release day gets its own `on_hold` order (`holdReason: 'awaiting_stock'`), numbered after #1 and sorted by date. The group's `agreedAt` and `expectedAt` are its latest release instant.
  - A "day" is computed in the shop timezone (the Europe/Rome case groups instants that UTC would split).
  - A partly backordered line ships its shelf part now and holds the owed part (`cause: 'backorder'`, promised date). A fully uncovered line opens nothing and is held as #1.
  - A group promised the 30-day default is marked `defaulted` and kept apart from a dated one. A preorder and a backorder due the same day get separate groups.
  - Made-to-order (`noWithdrawal`) lines get their own fulfillment order after the ordinary one, including within a preorder release day.
  - A preorder with no release date is treated as ordinary. An empty order yields `[]`.
- `describe('remaining')` — `remainingOfLine`, `remainingOf` and `remainderLines`: quantity less shipped and canceled, with exhausted lines dropped from the remainder.
- `describe('statusOfLines')` — a table-driven (`it.each`) check of `open`, `in_progress`, `on_hold`, `closed` and `canceled`. A hold on a fulfillment order with nothing remaining is no hold, so the status is `closed`.
- `describe('checkShipLines')` — with no lines or an empty list named, ships everything that remains and returns `{ ok: true, lines }`. The rest of this suite is not shown here.

## Relationships
- Imports `checkShipLines`, `groupOrderLines`, `isFulfillable`, `isHoldable`, `isReleasable`, `isShippable`, `remainderLines`, `remainingOf`, `remainingOfLine`, `statusOfLines`, `summarize`, `withRemainderCanceled`, `withShipped`, and the types `FulfillmentLine` and `GroupableLine`, all from `../../domain` (`src/modules/delivery/domain/index.ts`), which re-exports the rules. The rules themselves are presumably in `src/modules/delivery/domain/fulfillment.ts` and related files such as `src/modules/delivery/domain/preorder.ts`; the test only references the barrel.
- The other neighbors (cart services, factories, presenter, emails, scenarios) are not imported directly in the visible part of this test.

## Notes
- Tests rely on explicit UTC timestamps and a timezone argument, so they are deterministic.
- The Rome case depends on winter UTC+1 (December dates).
- Test descriptions double as rule documentation, such as "the day's group leaves together, so it is promised for its latest release instant."
