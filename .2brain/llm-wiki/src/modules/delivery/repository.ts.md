---
source: src/modules/delivery/repository.ts
generated_at: 2026-11-22T04:52:00.845430+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/repository.ts

## Purpose
Delivery persistence layer: it owns the two collections (fulfillment orders and shipments) and the conditional writes that every delivery act goes through. Return types are written out explicitly because Mongoose's generics are too large for TypeScript to serialize an inferred type at an export boundary (TS7056).

## Key elements
- **`BoardFilters`**: filter options for the preorder board: `cause` (`preorder`, `backorder`, `any`), `state`, `productId`, `late`, `dueWithin` (days), and `orderIds` (restricts a caller to their own orders).
- **`ProductSummaryRow`**: one product's preorder unit counts (`paid`, `waiting`, `allocated`, `shipped`, `canceled`, `late`) plus `title` and `firstAgreedAt`.
- **`stateCondition`** (private): maps each `PreorderFulfillmentState` to a Mongo filter on `status` and `holdReason`. `waiting` means `on_hold` with `awaiting_stock`.
- **`boardWhere`** (private): ANDs all active `BoardFilters` parts into one `QueryFilter`. Returns `{}` when no filter is set.
- **`FulfillmentOrderPatch`**: the fields an act may change on a fulfillment order, plus an `unset` list of fields to remove.
- **`fulfillmentOrderRepository`**: the shared `createRepository` CRUD surface (using `applyFulfillmentOrderTransform`) extended with:
  - `findByOrderId`: one order's fulfillment orders sorted by `number`, optionally inside a session.
  - `findByOrderIds`: a batch read sorted by `orderId` then `number`, used for the account export.
  - `findInSession`: `findById` inside a transaction.
  - `insertIfAbsent`: upsert keyed on `{ orderId, number }` using `$setOnInsert`. It returns `true` only if it created the document, which makes creation idempotent.
  - `claim`: optimistic-concurrency write. It matches on `{ _id, revision }`, applies `$set`, `$unset` and `$inc revision`, and returns the updated document or `null` if the revision moved.
  - `scrubHoldNotesBefore`, `findWaitingForProduct`, `findDatePassed`, `searchBoard`, `summarizeProducts`: declared in the type, covering hold-note scrubbing, product-wait lookups, passed-date lookups, the paged board query, and the per-product aggregation. Their implementations are not visible in the excerpt.

The file also imports `shipmentModel`, `applyShipmentTransform`, `shipmentLifecycle`, `ShipmentLostReason`, `reencryptOf` and `conditionalStatus`, which are presumably for the shipment side of the repository, but that part is not shown.

## Relationships
- **`./model`**: supplies `fulfillmentOrderModel` and `shipmentModel`, their document types, and the `apply*Transform` functions.
- **`@infrastructure/persistence/create-repository`**: provides `createRepository`, `toObjectId`, and the `Repository` and `Wire` types.
- **`@infrastructure/persistence/conditional-status`**: `updateStatusIfIn`, imported as `conditionalStatus`.
- **`@infrastructure/security/reencrypt`**: imports `reencryptOf`, `ReencryptSpec` and `ReencryptReport`.
- **`src/modules/delivery/domain/fulfillment.ts`** and **`src/modules/delivery/domain/lifecycle.ts`** (imported through `./domain`): supply `FulfillmentOrderDraft`, `WaitCause`, `DUE_NOTICE_LEAD_MS` and `shipmentLifecycle`. `boardStateOf` in `./domain` must be kept in step with `stateCondition`.
- **`@domain-primitives/time`**: `DAY_MS`, used to turn `dueWithin` days into a date window.
- **Services** (`services/board.ts`, `cancel-remainder.ts`, `cut.ts`, `deliver.ts`, `digest.ts`) and **`presenter.ts`** are graph neighbors of this file. The visible code does not show how each uses it. The doc comments describe `claim` and `insertIfAbsent` as the acts' write path, `searchBoard` as the board's read, and `findByOrderIds` as the account export.

## Notes
- `stateCondition` is hand-synchronised with `boardStateOf` in `./domain`. The preorder board's integration suite checks that the filter and the label agree.
- `cause: 'preorder'` uses `cause: { $ne: 'backorder' }` because preorder waits created before backorder existed have no `cause`.
- `claim` is the concurrency guard. Two acts racing the same fulfillment order cannot both succeed, because the loser's revision filter matches nothing and it gets `null`.
- `insertIfAbsent` sets `revision: 0` on insert and sets `promisedAt` equal to `agreedAt` when an agreed date exists.
