---
source: src/modules/inventory/model.ts
sha256: 77aacafb9fb4a1fcc96495347d7e22f771113a38a272b08d929b8835f8c68830
generated_at: 2026-10-14T15:55:11.435141+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/model.ts

## Purpose

Defines the three Mongoose schemas, document interfaces, and registered models that the inventory module owns: **StockMovement** (append-only ledger), **StockLevel** (per-product stock counters), and **Reservation** (order holds). This is the single source of truth for collection shapes, indexes, and the serialization transforms used by the repository layer.

## Key elements

- **`MOVEMENT_REASONS`** – Array derived from the `StockMovementReason` enum at runtime; feeds the schema's `enum:` so it cannot drift from the contract.
- **`StockMovementDocument` / `stockMovementSchema` / `stockMovementModel`** – Ledger row with `productId`, `reason`, three delta columns (`onHandDelta`, `reservedDelta`, `preorderedDelta`), optional `reference`/`note`, and timestamps. Two indexes: per-product chronological and global chronological.
- **`applyStockMovementTransform`** – Built via `applySerialization`; maps `_id → id` and drops `__v` for lean reads.
- **`StockLevelDocument` / `stockLevelSchema` / `stockLevelModel`** – One document per product holding `onHand`, `reserved`, `available`, `preorderLimit`, `preordered`. Three indexes: `available` ascending (stock board), `preorderLimit` and `preordered` descending (preorder board).
- **`applyStockLevelTransform`** – Same serialization normalization pattern.
- **`ReservationItem`** – Embedded line on a hold: `productId`, `quantity`, optional `kind` (`stock` | `preorder`).
- **`RESERVATION_STATUSES` / `ReservationStatus`** – Four-state tuple: `held → committed → shipped | released`. Not exported from a contract type because reservations are never serialized to a client.
- **`ReservationDocument` / `reservationSchema` / `reservationModel`** – One document per order. `orderId` is unique (exactly-once gate). `items` is an embedded array. `status` drives all conditional transitions. `committedAt` stores the payment timestamp locally so `inventory` doesn't need to read the order document. `expiresAt` has **no** TTL index.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** – Provides `applySerialization`, which this module calls to build `applyStockMovementTransform` and `applyStockLevelTransform`.
- **`src/modules/inventory/domain/index.ts`** – Source of the `HoldKind` type imported for `ReservationItem.kind`.
- **`src/modules/inventory/repository.ts`** – Owns all queries and writes (`applyDelta`, `openLevel`, conditional status moves) against these three models.
- **`src/modules/inventory/services/allocate.ts`**, **`holds.ts`**, **`reserve.ts`** – Call into the repository; their guard logic and state transitions are what the schema fields (`status`, `committedAt`, delta columns) are shaped to support.
- **`src/modules/inventory/domain/transitions.ts`** – Defines the transition rules that determine which delta columns and status moves a given operation performs.
- **`src/modules/inventory/index.ts`** – Re-exports the public surface of this file.
- **`src/modules/inventory/tests/integration/*`** – Exercise these models end-to-end (repository CRUD, service state machines, property-based ledger invariants, crash-window recovery).
- **`scenarios/flows/backdate.ts`** – Uses the models in flow-scenario setup/teardown.

## Notes

- **No `min: 0` on stock counters** (`onHand`, `reserved`, `available`, `preordered`). Mongoose `$inc` bypasses schema validators, so a `min` there would be dead code. The real floor is the `$gte` guard in `repository.ts#applyDelta`'s update filter.
- **`available` is stored, not computed.** It is kept in lockstep by the same `$inc` that writes `onHand`/`reserved`, enabling an indexed scan for the stock board's `maxAvailable` filter instead of a collection-wide derive.
- **`orderId` uniqueness on Reservation** is the exactly-once guarantee for reserving: a retried checkout's second insert simply fails; no read-then-write race.
- **`items` is embedded, not referenced.** Releasing a hold must return what was *taken*, not what the order says today, and embedding avoids an `inventory → orders → inventory` dependency cycle.
- **No TTL index on `expiresAt`.** Expiry is handled by a sweep that releases units and flips status to `released`; a TTL index would delete the document and lose the units.
- **Index names are explicit.** Mongo identifies an index by name as well as key; a name mismatch would fail at startup rather than silently no-op.
- **`StockLevel.productId` is unique**, making the `openLevel` upsert (fired by `PRODUCT_CREATED`) idempotent under event retries.
