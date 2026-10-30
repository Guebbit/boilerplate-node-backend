---
source: src/modules/delivery/model.ts
sha256: b10e47fb92e209543b6b0a1fa5823c24ca03da5145c1fe8af49e23ba80f4c3cd
generated_at: 2026-10-29T03:35:18.854258+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/model.ts

## Purpose

Defines the two Mongoose document models for the delivery module — `FulfillmentOrder` (a group of order lines that should leave together) and `Shipment` (what actually left, with one tracking code) — including their schemas, TypeScript interfaces, indexes, and serialization transforms. Both records are keyed by `{ orderId, number }` for idempotency.

## Key elements

- **`FulfillmentOrderDocument` / `shipmentDocument`** — TS interfaces describing every persisted field, including the date-tracking fields (`agreedAt`, `promisedAt`, `expectedAt`, `lastNoticeAt`, `dueNoticeFor`) and hold/loss annotation fields.
- **`fulfillmentOrderSchema`** — Mongoose schema with enum-validated `status`, `kind`, `holdReason`, `cause`, `cancelReason`; embedded `lines` array; `timestamps: true`.
- **`shipmentSchema`** — Mongoose schema with optional `trackingCode`, `destination` (encrypted address copy), `forced` flag, and loss fields.
- **`fulfillmentOrderModel` / `shipmentModel`** — Compiled Mongoose models registered as `'FulfillmentOrder'` and `'Shipment'`.
- **`applyFulfillmentOrderTransform` / `applyShipmentTransform`** — Wrappers around `applySerialization` that normalise lean-read output (`_id` → `id`, drops `__v`).
- **`fulfillmentLineSchema` / `shipmentLineSchema` / `destinationSchema`** — Embedded sub-schemas (no `_id`).
- **Indexes** — Unique `{ orderId, number }` on both models; composite indexes for the daily sweep (`status`, `holdReason`, `expectedAt`), the board view (`expectedAt`, `_id`), product lookups (`lines.productId`), and the lost-parcel recovery (`sourceShipmentId`, sparse).
- **`FulfillmentOrderLine`** — Re-export of the domain `FulfillmentLine` type for the embedded line shape.
- **`FulfillmentOrderModel` / `ShipmentModel`** — `Model<…>` type aliases for use in repository signatures.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — Imports `applySerialization` to build the two `apply*Transform` functions used by the repository's lean reads.
- **`src/modules/delivery/domain/index.ts`** (and transitively `domain/fulfillment.ts`) — Imports `FulfillmentLine` and `WaitCause` to type the embedded lines and the `cause` field.
- **`src/modules/delivery/repository.ts`** — Consumes `fulfillmentOrderModel` / `shipmentModel` and the transform functions; this file's comment states "Queries live in `./repository`."
- **`src/modules/delivery/services/*`** (fulfill, cut, board, deliver, act, announce, found, actions) — Read and write documents through the repository; domain rules they enforce operate on the shapes defined here.
- **`src/modules/delivery/presenter.ts`** — Maps documents to view models using the field names defined in these interfaces.
- **`scenarios/flows/backdate.ts`** — Exercises the date fields (`expectedAt`, `promisedAt`, `lastNoticeAt`, `dueNoticeFor`) defined here.

## Notes

- `status` on a fulfillment order is **derived** from lines and hold state on every write (see `statusOfLines` in the domain layer); do not set it independently.
- `holdNote` / `lostNote` are staff-only and "reaped" (scrubbed) over time; `holdMessage` / `lostMessage` are buyer-facing and **never** reaped — they are kept with the order like any customer message.
- `sourceShipmentId` links a fulfillment order back to the lost shipment that created the outstanding obligation; the sparse index on it powers the "parcel turns up" recovery path.
- `revision` is a monotonic counter used as an optimistic-concurrency guard: a shipment or cancel must match the current revision to claim a remainder, preventing two racers from both landing.
- `defaulted: true` marks that the promise date came from the 30-day system default rather than a catalogue date; later catalogue changes intentionally do **not** update this order.
- `destination` on a shipment is an encrypted copy of the order's shipping address (see `./pii`); it is wiped when the order's own address is redacted.
- The file exports schemas directly (`fulfillmentOrderSchema`, `shipmentSchema`) in addition to the compiled models — other modules may reference the schema for validation or introspection without importing the model.
