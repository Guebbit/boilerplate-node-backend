---
source: src/modules/delivery/model.ts
sha256: 005db966569761eff32bd3503a734aca3858013903c1d2a40876f177d6c22e3f
generated_at: 2026-11-08T05:30:58.246562+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/model.ts

## Purpose

Defines the two MongoDB collections for the delivery module — **FulfillmentOrder** (a group of an order's lines that should leave together, created when the order is paid) and **Shipment** (a concrete parcel that left, with one tracking code and one timestamp) — including their Mongoose schemas, embedded sub-document schemas, compound indexes, and the compiled models used by the repository and services.

## Key elements

- **`FulfillmentOrderDocument`** / **`ShipmentDocument`** – TypeScript interfaces describing the full shape of each record (status enums, hold/loss fields, date promises, revision counter, embedded line arrays).
- **`FulfillmentOrderLine`** – type alias for `FulfillmentLine` from `./domain`; carries `shippedQuantity` and `canceledQuantity` to track partial fulfillment.
- **`ShipmentLineDocument`** – simpler embedded line (no shipped/canceled tracking); frozen at the moment of the cut.
- **`fulfillmentLineSchema`**, **`destinationSchema`**, **`shipmentLineSchema`** – embedded Mongoose schemas (`_id: false`).
- **`fulfillmentOrderSchema`** – top-level schema with five compound/sparse indexes (unique `{orderId, number}`, status+holdReason+lines.productId, status+holdReason+expectedAt, sourceShipmentId, expectedAt, lines.productId).
- **`shipmentSchema`** – top-level schema with two indexes (unique `{orderId, number}`, `fulfillmentOrderId`).
- **`fulfillmentOrderModel`** / **`shipmentModel`** – compiled Mongoose models registered as `"FulfillmentOrder"` and `"Shipment"`.
- **`applyFulfillmentOrderTransform`** / **`applyShipmentTransform`** – serialization helpers (from `@infrastructure/persistence/serialize`) that rename `_id`→`id` and drop `__v` for lean reads.
- **`FulfillmentOrderModel`** / **`ShipmentModel`** – exported type aliases for the generic `Model` type, consumed by the repository.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** – provides `applySerialization`, used to build the two `apply*Transform` helpers.
- **`src/modules/delivery/domain/fulfillment.ts`** (via `./domain`) – source of the `FulfillmentLine` and `WaitCause` types consumed here.
- **`src/modules/delivery/repository.ts`** – imports the compiled models and the `*Model` type aliases to issue all read/write queries.
- **`src/modules/delivery/services/*`** (`cut.ts`, `fulfill.ts`, `deliver.ts`, `found.ts`, `board.ts`, `act.ts`, `actions.ts`, `announce.ts`) – read and write the two collections through the repository; the `revision` field and unique `{orderId, number}` indexes enforce their optimistic-concurrency and idempotency guarantees.
- **`src/modules/delivery/presenter.ts`** – maps `FulfillmentOrderDocument` / `ShipmentDocument` into presentation shapes for the UI.
- **`src/modules/delivery/index.ts`** – public barrel; re-exports the models and document types to the rest of the application.
- **`scenarios/flows/backdate.ts`** – integration-flow test that seeds and asserts against both collections.

## Notes

- **`status` on FulfillmentOrder is derived**, not set directly: it is recomputed from `lines` and hold state on every write (see `statusOfLines` in domain). Writing `status` directly is a bug.
- **`holdNote` vs `holdMessage`** (and the analogous `lostNote` / `lostMessage` pair) serve different audiences: `*Note` is internal staff text and is *reaped* (purged) with the hold/loss; `*Message` is buyer-facing copy and is *never* reaped. Do not swap them.
- **`promisedAt`** starts as `agreedAt` and is the buyer's current commitment; `expectedAt` is the system's current ship estimate. The 16 CFR 435.2 consent-reminder clock is measured from `promisedAt`, not `expectedAt`.
- **`revision`** is a monotonically increasing counter incremented on every write. Shipment creation and cancellation both use a `findAndUpdate` that matches on `revision` to prevent two racing operations from claiming the same remainder.
- **`sourceShipmentId`** links a fulfillment order back to the lost shipment that created it (or the parent order a short-stock split carved it from). The sparse index on this field exists solely for the "lost parcel turns up" recovery path.
- **`destination`** on Shipment stores a *copy* of the order's shipping address at cut-time, encrypted under the shipment's `_id`. It is independently wiped when the order's address is redacted; it is absent for digital fulfillments and pickup methods.
