---
source: src/modules/delivery/domain/reship.ts
generated_at: 2026-11-22T04:49:12.393599+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/domain/reship.ts

## Purpose
Pure domain logic for deciding which fulfillment orders reopen when delivered goods are returned and sent again (a replacement under the legal guarantee), and which of those reopened orders carry the part the shelf cannot cover. It has no database access, so every case can be unit-tested directly. The lines themselves are changed elsewhere through `withLoss`, the same rule a lost parcel follows.

## Key elements
- `ReopenableFulfillmentOrder`: the input shape. It has `id`, `physical` (digital orders have nothing to resend), `number` (position among the order's fulfillment orders), and `lines` (`FulfillmentLine[]`).
- `Reopening`: the output shape for one fulfillment order. It has `fulfillmentOrderId` and the `units` (`ProductQuantity[]`) it gives back to be sent again.
- `planReopening(orders, needed)`: takes the needed units per product off the shipped quantity (`shippedQuantity` summed over matching lines) of the physical fulfillment orders, latest `number` first.
  - It returns a `Reopening[]`.
  - It returns `undefined` if any product has fewer units shipped than needed.
- `shareOwed(reopenings, owed)`: spreads the owed units (the part the shelf couldn't cover) across the reopenings in order, so no order gives the owed order more of a product than it reopened.
  - It returns a `Map` from fulfillment order id to the owed units that order hands over.
  - Every reopening gets an entry, possibly with an empty array.

## Relationships
- `src/modules/delivery/domain/fulfillment.ts`: imports the types `FulfillmentLine` and `ProductQuantity`. The `withLoss` rule mentioned in the module doc is not in this file.
- `src/modules/delivery/services/reship.ts`: the service layer that sits above this module and uses these pure functions. The dependency graph links the two files, but this file does not show how the service calls them.
- `src/modules/delivery/domain/index.ts`: part of the domain barrel. The graph links it to this file.
- `src/modules/delivery/tests/unit/reship.test.ts`: unit tests for these functions.
- `src/modules/delivery/tests/unit/fulfillment.test.ts`: linked in the graph. This file does not show what it checks.

## Notes
- `planReopening` is all-or-nothing across products. A single product that can't be covered makes the whole result `undefined`, even if the other products were planned.
- A product's units can come from several fulfillment orders. Each order is drained up to its shipped quantity before the next, earlier one is used.
- `shareOwed` doesn't validate that `owed` fits within the reopenings. Any owed quantity beyond what the reopenings cover is silently left unallocated.
- Both functions rely on `number` for ordering, and `planReopening` doesn't mutate its input (it uses `toSorted`).
- The module doc points to design background in `docs/modules/delivery.md#replacement-after-a-return`.
