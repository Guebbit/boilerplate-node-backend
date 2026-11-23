---
source: src/modules/orders/services/actions.ts
source_sha256: d1c6e4f4795637ea6296e8fbd8b527b8024ff364add0b97fb3d25a6ab861e2a2
context_sha256: 7f793c142469ce76a9ba60ac7dd5cdf9090c1435fa50ca6549d5263a3dac0a79
generated_at: 2026-11-22T06:18:16.905200+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/actions.ts

## Purpose
Decides what a given caller may do to a given order, so clients never re-derive the rules. It combines the pure, status-based rules from `../domain` (shared with the write path's guards, so the flag and the guard cannot disagree) with the caller's permission keys and ownership. The result is an `OrderActions` object attached to the order's wire shape.

## Key elements
- `withActions(order, authContext?)` (exported): serializes one order with `presentOrder`, resolves each line's live image with `resolveCurrentImages` (async `$in` lookup), then attaches `actions` and carries the version counter with `carryVersion`. It returns `Promise<Order>`.
- `withListActions(page, authContext)` (exported): takes a search page of `ExportOrder` rows. It loads the backing documents in one `orderRepository.findByIds` query and maps each row to a list item via `presentOrderListItem` with its `actions`. An empty page short-circuits. Rows whose document has disappeared are dropped.
- `orderActionsOf` (internal): the pure per-order computation. It reads no database, so a list can call it once per row. It builds the status-derived actions from `orderActionsFor(status, actor)` and layers on:
  - the cancel withdrawal once shipped;
  - the `pay` gate;
  - the start/override flags;
  - the withdrawal flags;
  - `recordPayment`;
  - the delete flags;
  - `invoice`;
  - the final `forStanding` filter.
- `startAndOverrideActions`: computes `process`, `overrideStatus`, `correctAddress` and `correctBilling` from the caller's own keys.
  - `process` needs `start:Shipment` and `canProcessOrder`.
  - The address and billing corrections need `update:Order`.
  - `overrideStatus` needs `override:Order`, and its targets exclude those rejected by `shipsAwaitedStock`.
  - With no `authContext`, everything is false or empty.
- `withoutCancelOnceShipped`: forces `cancel` to false when `fulfillment.shipped` is true, because a cancel applies to the whole order.
- `canRecordPayment`: requires the order to be payable (`isPayable`) and the caller to hold `create:Payment`.
- `holdsCheckout`: requires `checkout:Cart`; `pay` is offered only to a caller who holds it.
- `withdrawalActions`: offered only to the order's own buyer. It returns `withdraw` from `canWithdraw`, plus `withdrawBlocked` carrying the refusal from `withdrawalRefusalOf`, so a client can show a disabled button with the reason.
- `deleteActions`: `delete`, `hardDelete` and `restore`, all gated on `delete:Order`. They use `softDeletable`/`hardDeletable` and `deletedAt`.
- `forStanding`: for a customer actor, `cancel` is allowed only for the buyer. `pay` is always buyer-only.

## Relationships
- `../domain` (billing, deletion, fulfillment, lifecycle, rules, withdrawal, via the index): supplies every state predicate used here, plus the `OrderActor` type and `isBuyer`.
- `@kernel/permissions` (`callerForSubject`) and `@kernel/ability` (`holds`): resolve the caller's keys and test them.
- `./scope` (`actorOf`): classifies the caller as a customer or an operator.
- `./current` (`resolveCurrentImages`): adds the live picture to each order line.
- `../presenter` (`presentOrder`, `presentOrderListItem`): the wire-shape builders that `actions` is attached to.
- `../repository` (`orderRepository`): its `findByIds` batch-loads the documents for a list page.
- `../model` (`OrderDocument`): the document type; the flags read it as a `Lean` row.
- `@infrastructure/persistence/create-repository` (`Lean`), `search` (`PaginatedMeta`) and `versioning` (`carryVersion`): supply the lean-row type, the page metadata type, and the edit-counter carry-over for `ETag`.

## Notes
- The ship, deliver and fulfill actions are deliberately absent. They live on fulfillment orders and shipments, which carry their own `actions` (in `delivery`'s presenter).
- `process` is tested against the caller's own key rather than the `actorOf` customer/admin split. This is because a warehouse operator holds `start:Shipment` without `update:Order`.
- `invoice` is a proxy: `Boolean(order.paidAt)`. The invoice endpoint (owned by `invoicing`) still checks for real and may 404 in the rare gap.
- `actions` must be on the wire shape, or the schema's transform drops it.
