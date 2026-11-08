---
source: src/modules/inventory/model.ts
sha256: e70d8b2cde8db6d66e6085250a43dff065325c15186ee637486cbe2f3c932a3a
generated_at: 2026-11-08T05:59:51.162319+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/model.ts

## Purpose

Defines the three Mongoose schemas, TypeScript interfaces, and model registrations that the inventory module owns: **StockMovement** (append-only ledger), **StockLevel** (per-product counters), and **Reservation** (order holds). This file is the single source of truth for collection shapes, index definitions, and serialization transforms. Business rules, query logic, and state transitions live elsewhere (services, repository, domain) — this file only declares *what is stored and how it is indexed*.

## Key elements

- **`MOVEMENT_REASONS`** – Array of all valid `StockMovementReason` values, read off the generated enum so the schema's `enum:` list cannot drift from the contract.
- **`StockMovementDocument` / `stockMovementSchema` / `stockMovementModel`** – Append-only ledger row. Stores `productId`, `reason`, and three delta columns (`onHandDelta`, `reservedDelta`, `backorderedDelta`) so the ledger is replayable. Two indexes: per-product (newest first) and global (newest first).
- **`applyStockMovementTransform`** – Serialization helper (`_id`→`id`, drop `__v`) built via `applySerialization`.
- **`StockLevelDocument` / `stockLevelSchema` / `stockLevelModel`** – One document per product holding `onHand`, `reserved`, `available`, `backorderLimit`, `backordered`. `productId` carries a unique index (makes `openLevel` upsert idempotent). Three indexes: stock board (`available` asc), preorder board (`backorderLimit` desc, `backordered` desc). No `min: 0` on counters — enforcement is via the repository's `$inc` guard, not Mongoose validation.
- **`applyStockLevelTransform`** – Same serialization pattern as the movement transform.
- **`ReservationDocument` / `reservationSchema` / `reservationModel`** – One hold per order. Embeds `items` (product + quantity + kind), a `status` enum (`held`→`committed`→`shipped`/`released`), `expiresAt`, and `committedAt` (preorder queue key). `orderId` is unique — the exactly-once gate for reserving.
- **`ReservationStatus`** – Union type derived from the `RESERVATION_STATUSES` const tuple. Deliberately *not* a contract type; reservations are never serialized to clients.
- **`ReservationItem`** – Embedded sub-document shape: `productId`, `quantity`, optional `kind` (`stock` | `backorder`, defaults to `stock`).
- **`applyStockLevelTransform`**, **`applyStockMovementTransform`** – Both delegate to `applySerialization` from `@infrastructure/persistence/serialize`.

## Relationships

- **`src/modules/inventory/domain/index.ts`** — Imports `HoldKind` (used in `ReservationItem.kind` and the sub-schema enum).
- **`src/infrastructure/persistence/serialize.ts`** — Provides `applySerialization`, consumed to build both transforms.
- **`src/modules/inventory/repository.ts`** — The only file that issues queries against these three models. Owns `applyDelta` (the `$inc` writer), `openLevel` upsert, and the stock-board/preorder-board queries that the indexes here support.
- **`src/modules/inventory/services/reserve.ts`, `holds.ts`, `allocate.ts`** — Call into the repository to mutate `StockLevel` and `Reservation` rows; their guard conditions are what enforce the non-negativity and backorder-limit invariants this file's comments reference.
- **`src/modules/inventory/domain/transitions.ts`** — Declares the movement reasons and delta shapes that `StockMovementDocument` mirrors.
- **`src/modules/inventory/index.ts`** – Barrel file re-exporting the models/types defined here.
- **`scenarios/flows/backdate.ts`** – Scenario flow that exercises these collections (backorder / backdated movements).
- **Test files** (`tests/factories.ts`, `tests/integration/*.test.ts`) – Construct and assert against all three models.

## Notes

- **No `min: 0` on stock counters.** Mongoose validation cannot see the pre-update value during `$inc`, so the real floor is the repository's `$gte` guard in the update filter. Adding a schema-level `min` would be dead code.
- **`available` is stored, not derived.** It is kept in step by the same `$inc` as `onHand`/`reserved`, so the stock-board's `maxAvailable` filter hits an indexed column rather than computing `onHand − reserved` per row.
- **Reservation `items` are embedded, not referenced.** A deliberate decoupling: releasing a hold must return *what was taken*, not what the order document says now, and referencing `orders` would create a circular dependency.
- **No Mongo TTL index on reservations.** Expiry is handled by application-level sweep logic (see `services/holds.ts`), not automatic document deletion.
- **`committedAt` on Reservation** exists because the inventory module cannot read `orders.paidAt` (would introduce a dependency inversion). It serves as the preorder allocation queue key.
- **Index names are explicit** (`stockmovements_productId_createdAt`, etc.) to avoid silent startup failures when Mongo already holds the same key under a different name.
