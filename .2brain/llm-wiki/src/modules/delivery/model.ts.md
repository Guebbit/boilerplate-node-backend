---
source: src/modules/delivery/model.ts
generated_at: 2026-11-22T04:50:24.437934+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/model.ts

## Purpose
Defines the Mongoose schemas, document types, and compiled models for delivery's two records: the **fulfillment order** (a group of an order's lines that should leave together, made by rule when the order is paid) and the **shipment** (what actually left, at one time, with one tracking code). Each is made a database fact by a unique `{ orderId, number }` index. Shipment statuses mirror the tail of the order lifecycle, because tracking code and delivery timestamp are carrier facts the order has no field for.

## Key elements
- `FulfillmentOrderDocument` / `fulfillmentOrderSchema` / `fulfillmentOrderModel` (registered as `FulfillmentOrder`): holds `kind`, derived `status`, embedded `lines` (with `shippedQuantity` / `canceledQuantity`), hold fields (`holdReason`, `heldAt`, `holdNote`, `holdMessage`), wait-for-stock fields (`cause`, `defaulted`, `agreedAt`, `promisedAt`, `expectedAt`, `lastNoticeAt`, `dueNoticeFor`), `cancelReason`, `sourceShipmentId`, and `revision`.
- `ShipmentDocument` / `shipmentSchema` / `shipmentModel` (registered as `Shipment`): holds `fulfillmentOrderId`, `kind`, `trackingCode`, `status`, `lines`, encrypted `destination`, `forced`, `shippedAt`, `deliveredAt`, and loss fields (`lostAt`, `lostReason`, `lostNote`, `lostMessage`).
- `FulfillmentOrderLine` (alias of `FulfillmentLine` from `./domain`) and `ShipmentLineDocument`: the embedded line shapes, both with `_id: false`.
- `FulfillmentOrderModel` / `ShipmentModel`: Model types.
- `applyFulfillmentOrderTransform` / `applyShipmentTransform`: built with `applySerialization`; normalize `_id` → `id` and drop `__v` for the repository factory's lean reads.
- Indexes: unique `{orderId, number}` on both; fulfillment-order indexes for the product/hold lookup, the daily sweep (`expectedAt`), the sparse `sourceShipmentId` lookup, and the preorder board (`expectedAt`, `_id`, plus `lines.productId`); `fulfillmentOrderId` on shipments.

## Relationships
- Uses `postalAddressPaths` (`@infrastructure/persistence/postal-address-paths`) to build the embedded `destination` schema, and `applySerialization` (`@infrastructure/persistence/serialize`) for the transforms.
- Imports `FulfillmentLine` and `WaitCause` types from `./domain`; status/reason enums and `OrderAddress` come from `@types`.
- Queries live in `./repository`; rules live in `./services` and `./domain`, per the file's own comments. The neighbors `services/actions.ts`, `announce.ts`, `board.ts`, `cut.ts`, `deliver.ts`, `found.ts`, plus `presenter.ts`, `index.ts`, and `scenarios/flows/backdate.ts`, are related through the dependency graph; the file itself does not show how each uses it.

## Notes
- `status` on a fulfillment order is derived from the lines and the hold on every write (see `statusOfLines`); `holdReason` is present exactly while `on_hold`, and `cause` exactly while waiting for stock (absent reads `preorder`).
- `revision` counts every write. A shipment or cancel claims the fulfillment order by matching it, so two racing on the same remainder cannot both land.
- `destination` is stored encrypted under the shipment's `_id` (`./pii`), absent for pickups and digital fulfillment, and wiped on `order.redacted`.
- Free-text staff notes (`holdNote`, `lostNote`) are reaped; buyer-facing messages (`holdMessage`, `lostMessage`) are kept with the order and never scrubbed.
- `sourceShipmentId` links a fulfillment order to the lost shipment whose owed units it waits for, so the parcel turning up can find and close every part still owed.
- `defaulted` marks a 30-day default promise, so later catalogue date changes leave that order alone. `promisedAt` is the date the buyer currently holds.
- `lostAt` is kept if a lost shipment turns up and is then delivered.
