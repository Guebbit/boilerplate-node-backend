---
source: src/modules/delivery/repository.ts
sha256: 21f1cfd1893062e487bf69d86ab0af8248891bb31126fb4341cff592c9781d2e
generated_at: 2026-09-27T14:50:40.014575+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/repository.ts

## Purpose

Defines the shipment repository: standard CRUD (delegated to the shared factory) plus the domain-specific lookups the carrier service performs — single/batch retrieval by order, idempotent shipment creation, and an atomic conditional status transition. It is the persistence boundary for the delivery module.

## Key elements

- **`shipmentRepository`** (exported const) — the sole export. An object that spreads the factory-generated CRUD surface (`createRepository`) and adds four methods:
  - `findByOrderId(orderId)` — returns the single `ShipmentDocument` for an order, or `null` if none exists yet.
  - `findByOrderIds(orderIds)` — batch `find` via `$in`; used by the account data-export path so one request issues one query.
  - `upsertForOrder(orderId, trackingCode?)` — `findOneAndUpdate` with `upsert` + `$setOnInsert`; idempotent under concurrent first-ship races (loser's `trackingCode` is silently discarded).
  - `updateStatusIfIn(orderId, from[], to, extra?)` — atomic status transition guarded by a `$in` filter on `status`; returns `null` when the guard doesn't match, preventing double-stamp races.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — supplies the `createRepository` factory, the `toObjectId` helper, and the `Repository` / `Wire` type aliases. The CRUD portion of `shipmentRepository` is produced here.
- **`src/modules/delivery/model.ts`** — provides `shipmentModel` (the Mongoose model all queries hit) and `applyShipmentTransform` (passed as the factory's `transform` option). Also the source of the `ShipmentDocument` type.
- **`src/types/index.ts`** (`@types`) — source of the `ShipmentStatus` union used in `updateStatusIfIn`'s signature.
- **`src/modules/delivery/service.ts`** — primary consumer; calls the repository methods listed above to implement carrier-state transitions and lookups.
- **`src/modules/delivery/tests/integration/service.test.ts`** — integration tests that exercise this repository indirectly through the service.

## Notes

- The explicit return-type annotation on `shipmentRepository` (instead of `as const` / inference) exists to work around **TS7056**: Mongoose generics are too large for TypeScript to serialize an inferred type at an export boundary.
- All lookups key on `orderId` (not `_id`) because the model carries a `unique` index on `orderId`, making it a practical application-level key.
- `updateStatusIfIn` deliberately places the status guard **in the filter**, not in application logic; this is the same atomicity pattern used by `orderRepository` and `paymentRepository`. A read-then-write approach would allow two concurrent ticks to both stamp the target status.
- `upsertForOrder` sets `status: 'shipped'` and an optional `trackingCode` **only** via `$setOnInsert`; an existing document is never modified by this call.
