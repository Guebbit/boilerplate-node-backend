# src/modules/delivery/repository.ts

## Purpose
Defines the shipment repository for the delivery module: the standard CRUD surface provided by the shared repository factory, plus four domain-specific lookups the courier service relies on (order-based retrieval, idempotent creation, listing in-transit parcels, and atomic conditional status transitions).

## Key elements
- **`shipmentRepository`** (export) — Typed object spreading `createRepository<ShipmentDocument>` and adding the four custom methods below. Return type is written out explicitly (see Notes).
- **`findByOrderId(orderId)`** — Returns the single shipment linked to an order, or `null`.
- **`upsertForOrder(orderId, trackingCode)`** — Creates the shipment idempotently via `findOneAndUpdate` + `$setOnInsert` + `upsert: true`; a re-entering order finds its existing parcel instead of minting a second tracking code.
- **`findAllShipped()`** — Returns every shipment whose status is `'shipped'` (the courier's active work list).
- **`updateStatusIfIn(orderId, from, to, extra?)`** — Atomically transitions status only when the current status is in `from`; returns the updated document or `null` if no row matched the filter.

## Relationships
- **`src/infrastructure/persistence/create-repository.ts`** — Provides `createRepository` (spread into this object for CRUD), `toObjectId`, and the `Repository<T>` type used in the explicit return annotation.
- **`src/modules/delivery/model.ts`** — Source of `shipmentModel` (the Mongoose model all queries hit), `applyShipmentTransform` (passed to the factory), and the `ShipmentDocument` type.
- **`src/modules/delivery/service.ts`** — Primary consumer; the courier service calls `findByOrderId`, `upsertForOrder`, `findAllShipped`, and `updateStatusIfIn` to drive shipment lifecycle.
- **`src/types/index.ts`** — Provides the `ShipmentStatus` union used in `updateStatusIfIn`'s signature.
- **`src/modules/delivery/tests/integration/service.test.ts`** — Integration tests that exercise the service (and thus this repository) end-to-end against a real database.

## Notes
- The return type of `shipmentRepository` is spelled out manually because Mongoose's inferred generics are too large for TypeScript to serialize at an export boundary (error TS7056). This is the same reason the `Repository` type alias exists in the factory.
- `updateStatusIfIn` deliberately puts the status condition in the **filter**, not in a preceding read. Two concurrent ticks (double-click, demo racing a manual advance) would otherwise both load the same `'shipped'` parcel and both stamp `deliveredAt`; the filter makes mongod evaluate the match atomically, so exactly one writer wins and the loser receives `null`.
- All order-keyed lookups use `orderId` (unique index) rather than `_id`, consistent with the convention in `paymentRepository` and `orderRepository`.
- The doc comment references `docs/modules/delivery.md` for broader module context.
