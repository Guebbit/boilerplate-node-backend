---
source: src/modules/inventory/model.ts
generated_at: 2026-11-22T05:19:42.486496+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/model.ts

## Purpose
Defines the three Mongoose collections the inventory module owns: the stock movement ledger, the per-product stock level, and the order hold (reservation). The stock level is the only place `onHand`/`reserved` live; the product record holds no stock.

## Key elements
- **`MOVEMENT_REASONS`**: array built from `Object.values(StockMovementReason)`, used as the ledger schema's `enum:` so it cannot drift from the contract.
- **`StockMovementDocument` / `StockMovementModel` / `stockMovementSchema` / `stockMovementModel`**: the append-only ledger. Fields: `productId` (ObjectId ref `Product`), `reason`, `onHandDelta`, `reservedDelta`, `backorderedDelta` (all default 0, one column per counter so summing each column replays the counter), optional `reference` (order) and `note`. The document type is derived from the contract's `StockMovement`, with storage-specific overrides (ObjectId `productId`, `Date` timestamps). Indexes: `stockmovements_productId_createdAt` and `stockmovements_createdAt`.
- **`applyStockMovementTransform`**: serialization normalizer (`_id` → `id`, drops `__v`), built with `applySerialization`.
- **`StockLevelDocument` / `StockLevelModel` / `stockLevelSchema` / `stockLevelModel`**: one row per product (unique `productId`). Counters: `onHand`, `reserved`, `available` (stored as `onHand - reserved`), `backorderLimit` (`number | null`; 0 closes backordering, `null` means no cap), `backordered`, and `version` (incremented on every write). Indexes: `stocklevels_available__id`, `stocklevels_backorderLimit` and `stocklevels_backordered`.
- **`applyStockLevelTransform`**: serialization transform for stock levels.
- **`ReservationItem`**: one claimed line, with `productId`, `quantity` and optional `kind` (`HoldKind`; absent reads as `stock`).
- **`ReservationStatus` / `OPEN_RESERVATION_STATUSES`**: statuses are `held`, `committed`, `shipped` and `released`. The open set, which still sets units aside, is `held` and `committed`.
- **`ReservationDocument` / `ReservationModel` / `reservationSchema`**: the hold. One per order (unique `orderId`), with an embedded `items` array (`reservationItemSchema`, no `_id`, `quantity` min 1), `status`, `expiresAt` and optional `committedAt`. The file shown cuts off partway through `reservationSchema`, so its remaining fields, indexes and model export are not covered here.

## Relationships
- Imports `applySerialization` from `@infrastructure/persistence/serialize` (`src/infrastructure/persistence/serialize.ts`) for the transforms, and `StockMovementReason`/`StockMovement` from `@types`.
- Imports the `HoldKind` type from `./domain`, which resolves to the `src/modules/inventory/domain/index.ts` neighbor.
- Comments point to `./repository` (`src/modules/inventory/repository.ts`) for queries, including `applyDelta`, `conditionFor`, `applyTransition` and `stockBoard`. They point to `./services` (`services/holds.ts`, and the `reserve` and `allocate` services) for rules. These comments also describe the `PRODUCT_CREATED` listener's `openLevel` upsert.
- The module's tests (`src/modules/inventory/tests/factories.ts` and the contract and integration tests) and `scenarios/flows/backdate.ts` are listed as graph neighbors, but the visible content shows no interaction with them.

## Notes
- The schema has no `min: 0` on `onHand`, `reserved`, `available` or `backordered`. Their writes go through `$inc`, which Mongoose does not validate. The real floor is the `$gte` guard in the update filter, in `repository.ts`.
- `available` is stored, not derived, so the stock board's `maxAvailable` filter can use an index.
- A unique `orderId` makes reserving idempotent: a retried insert fails and no counter moves.
- The hold keeps its own copy of the items so releasing does not need the `orders` module, which would create a dependency cycle.
- There is deliberately no contract type for reservations, because they are never serialized to clients.
- A `released` hold can be taken again (`released → held`). `shipped` is terminal.
- The `kind` comments conflict: `ReservationItem` documents `stock | preorder` (via `HoldKind`), while the item sub-schema's enum is `['stock', 'backorder']`.
