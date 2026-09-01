# src/modules/inventory/model.ts

## Purpose

Defines the Mongoose schemas, interfaces, and model instances for the two inventory-owned collections: **StockMovement** (the append-only ledger) and **Reservation** (per-order holds). This module is the sole writer of stock counters on the product document; it stores *deltas* and *claims*, never a stock level itself, so that catalogue reads never require a join.

## Key elements

- **`MOVEMENT_REASONS`** — `Object.values(StockMovementReason)`; the array form Mongoose `enum:` expects.
- **`StockMovementDocument`** — Interface bridging the contract type `StockMovement` to Mongoose types (`ObjectId`, `Date`).
- **`stockMovementSchema`** — Ledger schema. Every row carries both `onHandDelta` and `reservedDelta` (each defaulting to `0`) so the ledger is replayable by column-sum. Optional `reference` (order id) and `note` (operator text).
- **`stockMovementModel`** — The Mongoose model (`'StockMovement'`).
- **`applyStockMovementTransform`** — `applySerialization(stockMovementSchema)`; normalises `_id`→`id`, strips `__v` for lean reads.
- **`ReservationDocument` / `ReservationItem` / `ReservationStatus`** — Hold document shape. `items` are embedded sub-docs (not references). Status is a three-state union: `'held' | 'committed' | 'released'`.
- **`reservationSchema`** — One document per order. `orderId` carries a **unique index** (exactly-once gate). `items` stores the hold's own copy of what was claimed. `status` acts as the conditional-move lock for all lifecycle transitions. `expiresAt` is a Date; no TTL index.
- **`reservationModel`** — The Mongoose model (`'Reservation'`).
- **`applyReservationTransform`** — Same serialisation pattern as the ledger.
- **Indexes** — Explicitly named: `stockmovements_productId_createdAt`, `stockmovements_createdAt`, `reservations_status_expiresAt`.

## Relationships

- **`src/types/index.ts`** — Source of the `StockMovementReason` enum and `StockMovement` contract type; this file derives its schema field list from the contract.
- **`src/infrastructure/persistence/serialize.ts`** — Provides `applySerialization`, which builds the two transform functions exported here.
- **`src/modules/inventory/repository.ts`** — Consumes `stockMovementModel` / `reservationModel` and the transforms for all read/write queries.
- **`src/modules/inventory/service.ts`** — Consumes the models to apply business rules (the "rules live here" contract noted in the model type comments).
- **Tests** — `schema-contract.test.ts` asserts the schema fields match the contract types; integration tests (`service.test.ts`, `ledger.property.test.ts`) exercise the models through the service/repository.

## Notes

- **No stock level is stored here.** The product document owns `onHand` / `reserved` counters; this module only writes deltas.
- **Ledger is append-only.** No update or delete paths exist by design; corrections are new rows.
- **Both deltas on every row** (one may be zero). This is what makes column-wise replay possible.
- **`reservation.items` is a denormalised copy**, not a lookup through the orders module, to avoid a circular dependency (`orders` → `inventory` → `orders`).
- **`orderId` unique index is load-bearing**, not merely hygienic: a retried checkout's second insert fails at the DB level, guaranteeing exactly-once reservation without a read-then-write check.
- **No TTL index on reservations.** Expiry is handled by an application-level sweep (`runReservationSweep`), because a TTL delete would orphan the units that still need releasing.
- **Index names are explicit.** Mongo identifies an index by name *and* key; an unnamed index on an existing key would fail at startup rather than no-op.
- **`ReservationDocument` is intentionally not derived from a contract type** — reservations are never serialised to a client; publishing them would give the frontend a second source of stock truth.
