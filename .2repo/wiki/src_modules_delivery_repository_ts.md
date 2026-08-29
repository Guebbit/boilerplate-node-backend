# src/modules/delivery/repository.ts

## Purpose

Data-access layer for shipment documents. Wraps the shared base-repository factory with standard CRUD, then adds the four domain-specific queries the courier service actually needs: lookup by order, idempotent creation, listing in-transit parcels, and a concurrency-safe status transition.

## Key elements

- **`shipmentRepository`** (sole export) — a plain object that spreads `createBaseRepository<ShipmentDocument>` and adds four methods. Its type is written out explicitly (intersection with `BaseRepository<ShipmentDocument>` plus the four method signatures) because Mongoose's inferred generics hit the TS 7056 serialization limit at an export boundary.
- **`findByOrderId(orderId)`** — `findOne` on `orderId`; returns `null` when no shipment exists yet (order still pre-warehouse).
- **`upsertForOrder(orderId, trackingCode)`** — `findOneAndUpdate` with `upsert: true` and `$setOnInsert`. Idempotent: a second call for the same order returns the existing parcel without minting a new tracking code.
- **`findAllShipped()`** — `find({ status: 'shipped' })`; the work-list the courier tick iterates over.
- **`updateStatusIfIn(orderId, from, to, extra?)`** — `findOneAndUpdate` whose **filter** includes `status: { $in: from }`. Only one concurrent caller can match and write; losers receive `null`. The `extra` field is merged into the `$set` alongside the new status.

## Relationships

- **`src/infrastructure/persistence/base-repository.ts`** — provides `createBaseRepository` (spread into the object), the `toObjectId` helper, and the `BaseRepository` type that anchors the explicit annotation.
- **`src/modules/delivery/model.ts`** — supplies `shipmentModel` (the Mongoose model used by every query) and `applyShipmentTransform` (passed to the base factory for document→domain mapping).
- **`src/types/index.ts`** — source of the `ShipmentStatus` type used in the `updateStatusIfIn` signature.
- **`src/modules/delivery/service.ts`** — primary consumer; calls `findByOrderId`, `upsertForOrder`, `findAllShipped`, and `updateStatusIfIn` to drive the courier lifecycle.
- **`src/modules/delivery/tests/integration/service.test.ts`** — exercises these methods through the service's public API in integration tests.

## Notes

- **Concurrency design of `updateStatusIfIn`:** the status precondition lives in the Mongo *filter*, not in a preceding read. Two racing ticks (operator double-click, demo script) both load the same parcel from `findAllShipped`, but only one passes the filter at write time; the other gets `null`. A read-modify-write sequence would let both stamp `deliveredAt` and the last writer would silently win.
- **Keyed on `orderId`, not `_id`:** `orderId` carries a unique index and every caller in the module already holds the order, mirroring the convention in `paymentRepository`.
- **`upsertForOrder` uses `$setOnInsert`, not `$set`:** the `trackingCode` and initial `status` are only written on first creation; a re-shipped order keeps its original tracking code.
