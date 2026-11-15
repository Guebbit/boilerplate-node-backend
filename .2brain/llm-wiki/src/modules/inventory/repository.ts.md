---
source: src/modules/inventory/repository.ts
sha256: 3baae8f00393b869e4bde5880c77e4c4464f5e5f373c5d911a58fe4bc6c08f5a
generated_at: 2026-11-14T20:05:30.406771+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/repository.ts

## Purpose

Persistence boundary for the inventory module. Owns the three MongoDB collections (`stockLevel`, `stockMovement`, `reservation`), exposes the `stockLevelRepository` object that services use to perform conditional counter writes and board reads, and keeps raw Mongo filter syntax out of the service layer. Business rules (which transition means what) live in `./services`; this file only translates a transition into a guarded write.

## Key elements

- **`conditionFor(reason, quantity, kind)`** (module-private) — Maps a `StockMovementReason` to the Mongo `QueryFilter` that must match before a counter write applies. Encodes the per-transition guard (e.g. `ship` requires both `onHand` and `reserved` to be sufficient; `adjust` must not drive `onHand` below `reserved`).
- **`stockLevelRepository`** (exported) — The main repository object. Extends the generic `Repository` with domain methods:
  - `insertIfAbsent(productId, session?)` — Upserts a zero-counter row; returns `true` only if *this* call created it (idempotent under redelivery).
  - `applyDelta(productId, reason, quantity, delta, session?, kind?)` — Single conditional write path for all counter transitions.
  - `setBackorderLimit(productId, limit)` — Updates the preorder cap.
  - `stockBoard({ skip, limit, maxAvailable? })` / `preorderBoard({ skip, limit })` — Paginated board queries returning counters only (no product fields).
  - `lowAvailabilityProductIds(threshold)` / `sumReserved()` — Aggregate helpers.
  - `findManyByProductIds`, `findByProductId`, `deleteByProductId` — Standard reads/deletes.
- **`StockLevelRow`** (exported interface) — One stock-board row: `productId`, `onHand`, `reserved`, `available`, `backorderLimit`, `backordered`. No product-name fields.
- **`PreorderLevelRow`** (exported interface) — One preorder-board row: counters plus `ordered` (lifetime), `held` (unpaid), `paid` (committed) outstanding units.
- **`orderedByProduct`** / **`outstandingByProduct`** (module-private) — Aggregations over the ledger and reservation collections that feed `preorderBoard`.
- **`toReservationItems`** (module-private) — Converts service-layer hold lines (string product ids) to storage shape with `Types.ObjectId` values.
- **`storedCap`** (module-private) — Normalizes a lean-read `backorderLimit`: `undefined` → `0` (closed), `null` passes through as `null` (no cap).

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — Supplies the generic `Repository` interface, `createRepository` factory, `toObjectId`, and the `Wire`/`Lean`/`AppendOnlyLedger` type helpers.
- **`src/infrastructure/persistence/conditional-status.ts`** — Provides `updateStatusIfIn` (aliased `conditionalStatus`) for atomic reservation-status transitions.
- **`src/infrastructure/persistence/mongo-errors.ts`** — Provides `isDuplicateKey` for catching unique-index violations.
- **`src/modules/inventory/model.ts`** — Source of all three Mongoose models, their transform functions, and the document/status types (`StockLevelDocument`, `ReservationStatus`, `OPEN_RESERVATION_STATUSES`, etc.).
- **`src/modules/inventory/domain/index.ts`**, **`src/modules/inventory/domain/hold-lines.ts`**, **`src/modules/inventory/domain/transitions.ts`** — Provide `CounterDelta`, `HoldKind`, `withAdded`, and the `counterDeltaFor` reason→deltas table. `conditionFor` must stay in sync with `counterDeltaFor` **by hand**; there is no shared test covering the pairing.
- **`src/modules/inventory/services/admin.ts`** — Caller side; services invoke `stockLevelRepository` methods but never construct Mongo filters themselves.
- **`src/modules/cart/tests/integration/checkout-interleavings.test.ts`**, **`src/modules/cart/tests/integration/checkout-stock-divergence.test.ts`**, **`src/modules/cart/tests/integration/product-removal-protects-orders.test.ts`** — Exercise the conditional-write paths end-to-end (stock divergence, hold interleavings, product-removal protection).
- **`src/modules/delivery/tests/integration/lost-parcel.test.ts`** — Exercises the `owed` transition (lost-parcel claim bypasses the backorder cap).
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Covers the `ship` transition's dual `onHand`/`reserved` guard.

## Notes

- **`backorderLimit` nullability is load-bearing.** A *missing* field means "cap = 0" (closed); only an explicit `null` means "no cap." The `conditionFor` backorder guard uses `$type: 'null'` (not `{ backorderLimit: null }`) precisely so it does not match the absent-field case. `storedCap` mirrors this in reads.
- **Board rows carry no product fields.** Product names/titles are composed by the caller (products module) after the read, not joined in this query. Do not add a `$lookup` to `products` here.
- **Types are written out, not inferred.** Mongoose generics are too large for TypeScript to serialize an inferred type at an export boundary (TS7056); the `Repository<…>` constraint and `Wire<…>` wrapper exist for this reason.
- **`insertIfAbsent` is the idempotency gate.** It returns `true` only on the *first* upsert for a given `productId`; redelivered `PRODUCT_CREATED` events see `false` and skip booking opening stock. Safe under race via the unique index on `productId`.
- **`conditionFor` has no dedicated unit test** for its alignment with `counterDeltaFor`. `transitions.test.ts` covers `counterDeltaFor` in isolation. Changes to either side must be reviewed as a pair.
