---
source: src/modules/inventory/model.ts
sha256: 5dce50748c7850749a6cb0d89c88a26d28be7ba27b364acfed63096b76017ce8
generated_at: 2026-11-14T20:04:08.920202+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/model.ts

## Purpose

Defines the Mongoose schemas, model instances, and document interfaces for the three collections the inventory module owns: the append-only **StockMovement** ledger, the **StockLevel** counter row (one per product), and the **Reservation** hold (one per order). All persistence-level concerns (index definitions, serialization transforms, enum constraints) live here; queries and business rules are delegated to `repository.ts` and `services/` respectively.

## Key elements

- **`MOVEMENT_REASONS`** – `Object.values(StockMovementReason)` read off the generated enum so the schema's `enum:` list can never drift from the contract.
- **`StockMovementDocument` / `stockMovementSchema` / `stockMovementModel`** – The ledger row. Stores per-column deltas (`onHandDelta`, `reservedDelta`, `backorderedDelta`) so the collection is replayable. Indexes: `(productId, createdAt desc)` and `(createdAt desc)`.
- **`applyStockMovementTransform`** – Serialization normalizer (`_id`→`id`, drops `__v`) built via `applySerialization`.
- **`StockLevelDocument` / `stockLevelSchema` / `stockLevelModel`** – One document per product holding `onHand`, `reserved`, `available`, `backorderLimit`, `backordered`, and a monotonically-incrementing `version`. `productId` is `unique: true` (makes `openLevel` upsert idempotent). Indexes: `(available, _id)` for the stock board, `backorderLimit desc`, `backordered desc`.
- **`applyStockLevelTransform`** – Same serialization pattern.
- **`ReservationItem`** – Embedded line item (`productId`, `quantity`, optional `kind`: `'stock'` | `'backorder'`).
- **`ReservationStatus`** / **`OPEN_RESERVATION_STATUSES`** – Four states (`held`, `committed`, `shipped`, `released`); the open subset is what still sets units aside.
- **`ReservationDocument` / `reservationSchema`** – One hold per order. `orderId` is `unique: true` (idempotent reservation). Never serialized to a client.
- **`reservationItemSchema`** – `_id: false` sub-schema for embedded items.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** – Imports `applySerialization` to build `applyStockMovementTransform` and `applyStockLevelTransform`.
- **`src/modules/inventory/domain/index.ts`** – Imports the `HoldKind` type used in `ReservationItem`.
- **`@types`** (shared) – Imports `StockMovementReason` and `StockMovement` so the schema mirrors the contract rather than restating it.
- **`src/modules/inventory/repository.ts`** – The sole writer: performs atomic `$inc` against `stockLevelModel` and appends to `stockMovementModel`. This file's comment on `min: 0` defers enforcement to that file's `$gte` guard.
- **`src/modules/inventory/services/holds.ts`** – Drives `reservationModel` state transitions between the four `ReservationStatus` values.
- **`src/modules/inventory/services/reserve.ts` / `allocate.ts`** – Consume `OPEN_RESERVATION_STATUSES` and the reservation document's allocation timestamp for ordering.
- **`src/modules/inventory/index.ts`** – Re-exports the models and interfaces for consumers.

## Notes

- **No `min: 0` on `onHand`/`reserved`/`available` in the schema.** Mongoose skips `min`/`max` validation on `$inc` updates, so the real floor is the `$gte` guard in `repository.ts#applyDelta`. Adding a schema-level `min` would be dead weight.
- **`available` is stored, not derived.** It is kept in lockstep via the same `$inc` call; this lets the stock-board query filter on an indexed column rather than computing `onHand - reserved` at read time.
- **`version` on StockLevel** is bumped by `$inc` on every write. The catalogue's mirrored copy records the version it was snapshotted at, so a stale write can never overwrite a newer one.
- **`backorderLimit: null` means "no cap"; `0` means "closed."** A row lacking the field reads as `0`.
- **Reservation is intentionally never exposed to clients.** The comment states the customer's order document is the canonical view; publishing the hold would create a second source of stock state for the frontend.
- **Index names are explicit** (e.g. `'stockmovements_productId_createdAt'`) because Mongo identifies indexes by name as much as by key; a name mismatch causes a startup failure rather than a silent no-op.
