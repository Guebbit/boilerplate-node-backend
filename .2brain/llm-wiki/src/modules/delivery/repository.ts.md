---
source: src/modules/delivery/repository.ts
sha256: 7b773c6ca7bbb7d8ee9d7ea1d9d6548fb0be9e316964c967bda2e2ad20226d3a
generated_at: 2026-09-23T18:37:05.669784+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/repository.ts

## Purpose

Exports `shipmentRepository` — the data-access layer for the delivery domain. It layers domain-specific lookups (order-based find, idempotent upsert, atomic status transition) on top of the shared CRUD surface provided by the repository factory.

## Key elements

- **`shipmentRepository`** — the sole export. An object that spreads `createRepository<ShipmentDocument, Wire<ShipmentDocument>>(shipmentModel, …)` and adds four carrier-specific methods.
- **`findByOrderId(orderId)`** — `findOne` on `orderId`; returns `null` if the order hasn't shipped yet.
- **`findByOrderIds(orderIds[])`** — single `$in` query for bulk retrieval (used by account-data export).
- **`upsertForOrder(orderId, trackingCode?)`** — `findOneAndUpdate` with `{ upsert: true }` and `$setOnInsert`, so concurrent first-time calls race safely and the loser's `trackingCode` is discarded rather than overwriting the winner's.
- **`updateStatusIfIn(orderId, from[], to, extra?)`** — conditional status write: the filter includes `status: { $in: from }`, so mongod guarantees exactly one concurrent tick succeeds; losers receive `null`.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — supplies `createRepository` (CRUD + transform wiring), `toObjectId` (string→ObjectId coercion), and the `Repository` / `Wire` types that shape the return annotation.
- **`src/modules/delivery/model.ts`** — provides `shipmentModel` (the Mongoose model) and `applyShipmentTransform` (document→wire mapping passed to the factory).
- **`src/types/index.ts`** — source of the `ShipmentStatus` union used in method signatures.
- **`src/modules/delivery/service.ts`** — the domain service that calls into `shipmentRepository` for its read/write operations.
- **`src/modules/delivery/tests/integration/service.test.ts`** — integration tests that exercise these methods through the service layer.

## Notes

- The return type is written out in full (not inferred) because Mongoose's generics exceed TypeScript's inference budget at an export boundary (TS7056). The same constraint motivates the `Repository` type alias itself.
- `upsertForOrder` depends on a **`unique` index on `orderId`** for idempotency; without it, two concurrent inserts would both succeed.
- `updateStatusIfIn` is keyed on `orderId` (not the document `_id`) because the unique constraint makes it a natural key — mirroring the pattern in `paymentRepository` / `orderRepository`.
- All methods return plain `Promise<…>` (via `.exec()`), not Mongoose query objects, so callers can `await` directly without chaining.
