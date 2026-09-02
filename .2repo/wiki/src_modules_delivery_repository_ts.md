# src/modules/delivery/repository.ts

## Purpose

Domain repository for Shipment documents. Wraps the shared `createRepository` factory with the Mongoose model, then layers the courier-specific lookups (order-to-shipment resolution, batch export, idempotent creation, and atomic status transitions) that the delivery service needs beyond plain CRUD.

## Key elements

- **`shipmentRepository`** — the sole export. Type is `Repository<ShipmentDocument>` intersected with an object literal declaring five additional methods; the intersection is written out explicitly because TypeScript cannot serialize the inferred Mongoose generic at an export boundary (TS7056).
- **`findByOrderId(orderId)`** — single-lookup: returns the shipment for one order or `null`.
- **`findByOrderIds(orderIds)`** — batch lookup via `$in`; used by the account data-export path to join shipments onto a caller's orders in one query.
- **`upsertForOrder(orderId, trackingCode)`** — idempotent creation: `findOneAndUpdate` with `$setOnInsert` + `upsert` + `returnDocument: 'after'`. Relies on the `unique` index on `orderId` so a re-shipped order reuses its existing parcel instead of minting a second tracking code.
- **`findAllShipped()`** — returns every document with `status: 'shipped'`; the courier's work list.
- **`updateStatusIfIn(orderId, from, to, extra?)`** — atomic conditional transition. The expected prior statuses go in the *filter* (`status: { $in: from }`) rather than a preceding read, so concurrent ticks race on the filter and exactly one succeeds; the loser receives `null`. Mirrors the same primitive exposed by `orderRepository` / `paymentRepository`.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — supplies the `createRepository` factory (standard CRUD + `transform` hook), the `toObjectId` helper used by every query above, and the `Repository` base type that `shipmentRepository` extends.
- **`src/modules/delivery/model.ts`** — provides `shipmentModel` (the Mongoose model queried here), `applyShipmentTransform` (passed as the factory's transform), and the `ShipmentDocument` type used throughout.
- **`src/types/index.ts`** — source of the `ShipmentStatus` type imported for the `from`/`to` parameters of `updateStatusIfIn`.
- **`src/modules/delivery/service.ts`** — consumer of `shipmentRepository`; calls the domain-specific methods listed above.
- **`src/modules/delivery/tests/integration/service.test.ts`** — integration tests that exercise the repository through the service layer.

## Notes

- The explicit return-type annotation on `shipmentRepository` is not optional style; removing it triggers TS7056 because Mongoose's generics are too large for inference serialization at a module boundary.
- `updateStatusIfIn` is keyed on `orderId` (not `_id`) because `orderId` carries a `unique` index, making it a valid secondary key for `findOneAndUpdate`.
- `upsertForOrder` uses `$setOnInsert` deliberately: re-entering the `shipped` state on an existing document does **not** overwrite `trackingCode`; only a genuinely new insert gets the code.
