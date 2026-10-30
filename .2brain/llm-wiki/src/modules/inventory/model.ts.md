---
source: src/modules/inventory/model.ts
sha256: a534b2f0408f1fae6c7a0406805e22476c883f684e724c4e9c2615d45e60add1
generated_at: 2026-10-29T04:01:20.008729+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/model.ts

## Purpose

Defines the three Mongoose schemas, interfaces, and models that back the inventory module's collections — **StockLevel** (per-product counters), **StockMovement** (append-only ledger), and **Reservation** (order holds). This file is pure data-shape: it declares what a document looks like and how it is indexed, but contains no queries or business rules. It exists so that repository, services, and tests all agree on the wire/storage shape without importing from each other.

## Key elements

- **`MOVEMENT_REASONS`** – `Object.values(StockMovementReason)`; feeds the ledger schema's `enum:` so it can never drift from the generated contract.
- **`StockMovementDocument` / `stockMovementSchema` / `stockMovementModel`** – The append-only ledger row. Three delta columns (`onHandDelta`, `reservedDelta`, `backorderedDelta`) make the ledger replayable by column-sum. Optional `reference` (order id) and `note` (human text).
- **`applyStockMovementTransform`** – Serialization adapter (`_id`→`id`, drop `__v`) built via `applySerialization`, consumed by the repository factory for lean reads.
- **`StockLevelDocument` / `stockLevelSchema` / `stockLevelModel`** – One row per product. Counters: `onHand`, `reserved`, `available` (= onHand − reserved, stored for indexed `maxAvailable` narrowing), `backorderLimit` (`0` = closed, `null` = uncapped), `backordered`. `productId` is unique, making `openLevel`'s upsert idempotent.
- **`applyStockLevelTransform`** – Same serialization pattern as above.
- **`ReservationItem`** – Embedded sub-schema line: `productId`, `quantity`, optional `kind` (`stock` | `backorder`).
- **`ReservationStatus`** – Union: `'held' | 'committed' | 'shipped' | 'released'`.
- **`ReservationDocument` / `reservationSchema` / `reservationModel`** – One hold per order. `orderId` is **unique** (the exactly-once gate). `items` is an embedded array (avoids a dependency on `orders`). `committedAt` stores payment time for preorder queue ordering without reading the order. `status` drives all conditional transitions.
- **Index definitions** – Explicitly named to prevent Mongoose startup failures from name/key collisions. Notable: `{productId:1, createdAt:-1}` on the ledger, `{available:1, _id:1}` on stock level, plus backorder-board indexes.

## Relationships

- **`./domain` (index, transitions)** – This file imports `HoldKind` from `./domain`; the ledger schema's `reason` enum and the reservation `kind` enum both reference domain-level constants.
- **`@infrastructure/persistence/serialize`** – Provides `applySerialization`, the shared helper that builds each collection's transform function.
- **`./repository`** – All read/write queries against the three models live here; this file supplies the model and the transform.
- **`./services/reserve`, `./services/allocate`, `./services/holds`** – Business rules (guards, conditional status moves) operate on these models; this file defines the shapes they read and write.
- **`./index`** – Re-exports the models and types so the rest of the app can `import { stockLevelModel } from '@modules/inventory'`.
- **`tests/factories`, integration tests** – Construct `StockLevelDocument`, `StockMovementDocument`, and `ReservationDocument` instances against these schemas.
- **`scenarios/flows/backdate`** – Scenario-level flow that exercises the reservation lifecycle (`committedAt` ordering) against these models.

## Notes

- **No `min: 0` on stock-level counters.** Mongoose `$inc` updates bypass schema validation, so a `min` constraint would be silently ignored. The real floor is the `$gte` guard in `repository.ts#applyDelta`'s update filter.
- **`available` is stored, not computed.** It is kept in lock-step via the same `$inc` as `onHand`/`reserved` so the stock-board query can narrow on an indexed column instead of scanning and deriving.
- **Reservation is intentionally not a contract type.** It is never serialized to a client; the order document is the customer-facing view. Adding a contract type would invite a second source of truth on the frontend.
- **`items` on Reservation is embedded, not referenced.** Reading the order's items would create a circular dependency (`inventory → orders → inventory`). Embedding also guarantees "give back exactly what was taken."
- **The `unique` index on `orderId` is the concurrency gate**, not a cosmetic constraint. A retried checkout's second insert simply fails at the DB level, moving no counters.
