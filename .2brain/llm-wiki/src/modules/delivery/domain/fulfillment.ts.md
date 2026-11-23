---
source: src/modules/delivery/domain/fulfillment.ts
source_sha256: f341b88ae70249facc1a37a0ef983d674ca386933dded2ce32f039f890fb6717
context_sha256: c499d1b06ee9e412f607a43c9c03f072c5c6b54d547fc8ce4f2657be271d3485
generated_at: 2026-11-22T04:47:26.946784+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/domain/fulfillment.ts

## Purpose
Pure rules for the delivery module's fulfillment orders: how a paid order's lines are split into fulfillment orders, how much of each line remains, which status follows from the lines and a hold, and how a shipment's lines are validated. It has no database access, so every case can be tested in isolation.

## Key elements
- **`WaitCause`**: `'preorder' | 'backorder'`, the reason a fulfillment order waits for stock.
- **`FulfillmentLine`**: a product line on a fulfillment order, with `quantity`, `shippedQuantity` and `canceledQuantity`.
- **`GroupableLine`**: a line as read from an order's frozen snapshot. It carries `ships`, and optionally `preorder`, `releaseDate`, `noWithdrawal` and `backorder` (`quantity`, `promisedAt`, `dated`). All of these are frozen at checkout.
- **`FulfillmentOrderDraft`**: a fulfillment order before it is stored. It has `number`, `kind`, `status` and `lines`, plus optional `holdReason`, `agreedAt`, `expectedAt`, `cause` and `defaulted`.
- **`remainingOfLine(line)` / `remainingOf(lines)`**: units that are neither shipped nor canceled, for one line and summed across lines.
- **`groupOrderLines(lines, timeZone)`**: the splitting rule that runs when an order is paid. It produces drafts numbered from 1, in this order:
  1. one `open` group for ordinary lines that ship now;
  2. one `open` group for `noWithdrawal` (made-to-order or perishable, Art. 16 CRD) lines that ship now;
  3. `on_hold` groups (`awaiting_stock`) for waiting lines, one per shop day, `noWithdrawal` value, cause and defaulted flag. Their `agreedAt` and `expectedAt` are both the latest date in the group.
  
  Groups are kept in the sorted order of their key.
- **`statusOfLines(lines, held)`**: derives the status of a fulfillment order.
  - No lines gives `closed`.
  - Nothing remaining gives `closed` if anything shipped, otherwise `canceled`.
  - A hold gives `on_hold`.
  - Otherwise `in_progress` once something has shipped, else `open`.
- **`ProductQuantity`**, **`ShipLinesVerdict`**: the shapes used by shipment-line checking. The verdict is `{ ok: true, lines }` or `{ ok: false, reason }`, where reason is one of `nothing-remains`, `unknown-product`, `too-many` or `duplicate`.
- **`checkShipLines(lines, requested)`**: decides which lines a shipment carries. With no request it ships everything that remains. A requested line must name a product on the fulfillment order and stay within what remains, and the same product named twice is refused. The visible part of the file ends partway through this function.

Internal helpers: `kindOf` (`physical` if any line ships, else `digital`), `toFulfillmentLine`, `partsOf` and `promisedAt`.

## Relationships
- Imports `dayInZone` from `src/domain-primitives/time.ts` to bucket waiting-line dates by shop day.
- Imports the `FulfillmentHoldReason`, `FulfillmentOrderKind`, `FulfillmentOrderStatus` and `ShipmentStatus` enums from `@types`.
- The other neighbors (the domain `index.ts`, `lost.ts`, `preorder.ts` and `reship.ts`, plus `model.ts`, `presenter.ts`, `repository.ts` and the services `actions`, `cancel-remainder`, `cut`, `ensure`, `found`, `fulfill` and `holds`) are linked through the dependency graph. The visible part of this file does not show how they use it.

## Notes
- Preorder and backorder facts come from the order's frozen snapshot, never from the product at payment time.
- A preorder line with no `releaseDate` is treated as an ordinary line, because there is nothing to wait for.
- A line the shelf only partly covers is split. The shelf part ships now, and the owed part waits on `backorder.promisedAt`.
- Groups whose date is the 30-day default are marked `defaulted`, so a later catalogue date change leaves them alone.
- An empty `lines` array gives `closed`, not `canceled`. The code comment says this happens when everything moved to another fulfillment order, for example a lost parcel's owed units.
- The source comment on `checkShipLines` says its "what remains" logic is deliberately similar to the one in other modules, which own their own copies and are free to diverge.
