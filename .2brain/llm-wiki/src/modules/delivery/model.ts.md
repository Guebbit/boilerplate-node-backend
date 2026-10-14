---
source: src/modules/delivery/model.ts
sha256: 6202d527b21d53f272098c1aa6377f5cc2a289697ca43b4d719671c817be21a5
generated_at: 2026-10-14T15:24:07.930131+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/model.ts

## Purpose

Defines the two Mongoose schemas and compiled models that persist the delivery module's core records — **FulfillmentOrder** (a group of an order's lines that should ship together) and **Shipment** (what actually left, with one tracking code). All shape, indexing, and serialization concerns for these two records live here; business rules and queries are deliberately kept out.

## Key elements

- **`FulfillmentOrderDocument` / `ShipmentDocument`** — TypeScript interfaces describing the full document shape (lines, status, hold/consent fields, timestamps).
- **`FulfillmentOrderLine`** (re-export of `FulfillmentLine` from `./domain`) and **`ShipmentLineDocument`** — the embedded line types.
- **`fulfillmentLineSchema` / `shipmentLineSchema`** — embedded sub-schemas (`_id: false`).
- **`fulfillmentOrderSchema`** — main schema with enum validation, defaults, and five compound indexes (unique `orderId+number`, status/hold/product lookups, consent sweep, board ordering, product filter).
- **`shipmentSchema`** — main schema with unique `orderId+number` index and a `fulfillmentOrderId` lookup index.
- **`applyFulfillmentOrderTransform` / `applyShipmentTransform`** — serialization transforms (`_id`→`id`, drop `__v`) consumed by the repository factory's lean reads.
- **`fulfillmentOrderModel` / `shipmentModel`** — the compiled Mongoose models, registered as `"FulfillmentOrder"` and `"Shipment"`.
- **`FulfillmentOrderModel` / `ShipmentModel`** — `Model<T>` type aliases for use in repository/service signatures.

## Relationships

- **`@infrastructure/persistence/serialize`** — imports `applySerialization`, which builds the two transform functions used by lean reads.
- **`./domain` (index / `fulfillment.ts`)** — provides the `FulfillmentLine` type that `FulfillmentOrderLine` re-exports; domain rules in `fulfillment.ts` read/write the `lines` array and derived `status`.
- **`./repository.ts`** — performs all queries against `fulfillmentOrderModel` and `shipmentModel`; this file supplies the models and the serialization transforms.
- **`./services/fulfill.ts`** — creates fulfillment orders when an order is paid.
- **`./services/cut.ts`** — creates shipments and claims fulfillment-order lines via the `revision` counter.
- **`./services/holds.ts`** — writes `holdReason`, `holdNote`, and derived `status`.
- **`./services/announce.ts` / `./services/notice.ts`** — read/write the consent, deadline, `lastNoticeAt`, and `slips` fields for the daily preorder sweep.
- **`./services/board.ts`** — queries the `expectedAt` and `lines.productId` indexes for the preorder board.
- **`./services/deliver.ts`** — sets `deliveredAt` and updates `ShipmentStatus`.
- **`./presenter.ts`** — maps document shapes into API/view models.
- **`./index.ts`** — re-exports the models and types for the rest of the module.
- **`scenarios/flows/backdate.ts`** — exercises these models in integration-style flow tests.

## Notes

- **`revision` is an optimistic-concurrency counter.** Both a shipment cut and a cancel claim a fulfillment order by matching the current `revision`; incrementing it atomically prevents two concurrent writes from landing on the same remainder.
- **`status` is derived, not independent.** It is recomputed from `lines` + hold on every write (see `statusOfLines` in domain); treat the stored value as a cache for queries, not as a source of truth.
- **`number` is 1-based and unique per `orderId`.** This is the idempotency key for "created once when the order is paid" (fulfillment orders) and "next shipment slot" (shipments).
- **`forced: true` on a shipment** means staff recorded it manually or an override bypassed the normal cut flow.
- **`slips` counts late-date notifications.** A second date slip always escalates to an explicit buyer consent ask rather than another passive notice.
- **Indexes are intentionally compound and named.** Do not add overlapping single-field indexes; the five fulfillment-order indexes cover the known query patterns (idempotency, moved-date lookup, daily sweep, board order, product filter).
