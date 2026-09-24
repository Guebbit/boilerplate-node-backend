---
source: src/modules/inventory/model.ts
sha256: 49ab9706fe52808c0118bbcbf64371b2ff6e399cb7c415bd2525b22f8907607b
generated_at: 2026-09-23T18:45:07.683312+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/model.ts

## Purpose

Defines the three Mongoose schemas, document interfaces, and models that back the inventory module: the append-only **StockMovement** ledger, the **StockLevel** counter (source of truth for `onHand`/`reserved`/`available`), and the **Reservation** hold (per-order product claims with a `held → committed | released` lifecycle). This file owns the storage shape and index strategy; queries live in `repository.ts` and business rules in `service.ts`.

## Key elements

- **`MOVEMENT_REASONS`** — `Object.values(StockMovementReason)` cast to the array shape Mongoose's `enum:` expects; keeps the schema's enum list in lockstep with the contract type.
- **`StockMovementDocument` / `stockMovementSchema` / `stockMovementModel`** — Append-only ledger row. Stores `onHandDelta` + `reservedDelta` (both default 0) so summing columns reproduces the counter. Indexes: `(productId, createdAt DESC)` and `(createdAt DESC)`.
- **`applyStockMovementTransform`** — `applySerialization`-derived mapper: `_id` → `id`, drops `__v`. Used by the repository for lean reads.
- **`StockLevelDocument` / `stockLevelSchema` / `stockLevelModel`** — One doc per product. `productId` is unique (makes `ensureLevel` upsert idempotent). Stores `available` as a materialized `onHand − reserved` (clamped ≥ 0) so the stock-board query narrows on an indexed column. Index: `(available ASC, _id ASC)`.
- **`applyStockLevelTransform`** — Same serialization mapper for the stock-level collection.
- **`ReservationItem` / `ReservationStatus` / `ReservationDocument`** — Hold document: one per order (`orderId` unique → exactly-once insert gate). Embeds `items` (product + quantity) so release doesn't depend on the `orders` module. `status` is a state machine (`held | committed | released`) guarded by conditional updates. `expiresAt` is managed by a sweep, **not** a Mongo TTL index. Index: `(status, expiresAt ASC)`.
- **`applyReservationTransform`** — Serialization mapper for reservation reads.

## Relationships

- **`src/types/index.ts`** — Imports `StockMovementReason` (enum) and `StockMovement` (contract interface); the schema fields are derived from these so the storage shape cannot drift from the API contract.
- **`src/infrastructure/persistence/serialize.ts`** — Provides `applySerialization`, which each of the three `apply*Transform` exports delegates to for `_id`/`__v` normalization.
- **`src/modules/inventory/repository.ts`** — The sole consumer of the three models for read/write queries; this file deliberately contains no query logic.
- **`src/modules/inventory/service.ts`** — Imports the models (via repository) and applies the transition rules that write `StockLevel` counters and append `StockMovement` rows.
- **`src/modules/inventory/index.ts`** — Barrel re-export for the module's public surface.
- **`scenarios/flows/backdate.ts`** — Drives ledger/level state changes in scenario flows (e.g., backdating a movement's `createdAt`).
- **`src/modules/inventory/tests/unit/schema-contract.test.ts`** — Asserts schema field names/types match the `@types` contract.
- **`src/modules/inventory/tests/integration/repository.test.ts` / `service.test.ts` / `ledger.property.test.ts`** — Integration and property tests exercising the three models through repository and service.
- **`tests/integration/scenarios/shop.test.ts`** — End-to-end shop flow that exercises reservation → commit/release transitions against these collections.

## Notes

- The `products` collection carries a synced copy of `onHand`/`reserved` for join-free catalogue reads, but **this module never reads that copy back** — the `StockLevel` collection is the sole write target for stock counters.
- `available` is stored (not computed) and kept in step by `applyTransition`; the stock-board query narrows on it directly rather than deriving `onHand − reserved` at read time.
- `ReservationDocument.items` is embedded (not a reference to the order) to avoid a circular dependency on the `orders` module and to record what was actually taken, not what the order says today.
- Index names are set explicitly (e.g. `'stockmovements_productId_createdAt'`) because MongoDB identifies indexes by name as well as key; a name mismatch on an existing key causes a startup failure rather than a silent no-op.
- `ReservationStatus` is intentionally **not** part of any public contract type — reservations are never serialized to a client.
