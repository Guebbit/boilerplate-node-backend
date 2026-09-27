---
source: src/modules/inventory/model.ts
sha256: abfff1ce79f52cf2958bdaaf8e28b38e385d5a7057bb7cadff4dc55199780420
generated_at: 2026-09-27T14:55:34.116838+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/model.ts

## Purpose

Defines the three Mongoose schemas, document interfaces, and models that the inventory module persists: the append-only stock-movement ledger, the per-product stock-level counters, and the per-order reservation (hold). This file is the single source of truth for document shape, indexes, and serialization transforms; it contains no query logic and no business rules.

## Key elements

- **`MOVEMENT_REASONS`** — `Object.values(StockMovementReason)` from the contract; feeds the schema's `enum:` so it cannot drift from the wire type.
- **`StockMovementDocument` / `stockMovementSchema` / `stockMovementModel`** — the ledger. Append-only; stores `onHandDelta` + `reservedDelta` as a pair (not one signed number) so summing columns reproduces the counter. Indexes: `{productId, createdAt:-1}` and `{createdAt:-1}`.
- **`StockLevelDocument` / `stockLevelSchema` / `stockLevelModel`** — one row per product holding `onHand`, `reserved`, and a stored `available` column. Unique index on `productId` makes the `ensureLevel` upsert idempotent. Index: `{available, _id}` for the stock-board query.
- **`ReservationDocument` / `reservationSchema` / `reservationModel`** — one row per order. Embeds `items` (productId + quantity) rather than referencing the order. `status` is a four-state machine (`held → committed | released | restocked`); every transition is a conditional move off `held` for exactly-once semantics. Unique index on `orderId`. Index: `{status, expiresAt}` for the expiry sweep.
- **`applyStockMovementTransform` / `applyStockLevelTransform` / `applyReservationTransform`** — serialization normalizers (`_id`→`id`, date handling) built via `applySerialization`, consumed by the repository factory for lean reads.
- **`ReservationItem`**, **`ReservationStatus`** — local types; `ReservationDocument` is deliberately *not* derived from a contract type because reservations are never serialized to a client.

## Relationships

- **`src/types/index.ts`** — imports `StockMovementReason` and `StockMovement`; the ledger's `enum` and `StockMovementDocument` shape are derived from these, so the schema tracks the contract automatically.
- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, which produces the three `apply*Transform` exports.
- **`src/modules/inventory/repository.ts`** — owns all queries against these models (the schema file defers to it).
- **`src/modules/inventory/service.ts`** — owns business rules (transitions, guards); writes to `StockLevel` via `$inc` and moves `Reservation` status conditionally.
- **`src/modules/inventory/index.ts`** — barrel re-export; consumers import the models through this path.
- **`src/modules/inventory/tests/unit/schema-contract.test.ts`** — asserts schema fields stay aligned with the `@types` contract.
- **`src/modules/inventory/tests/integration/ledger.property.test.ts`** — property-tests that summing `onHandDelta`/`reservedDelta` reproduces the `StockLevel` counters.
- **`src/modules/inventory/tests/integration/repository.test.ts`** / **`service.test.ts`** — integration tests exercising the models through repository and service.
- **`tests/integration/concurrency/payment-races.test.ts`** — verifies that concurrent status transitions on a `Reservation` document are exactly-once (second mover loses the conditional match).
- **`scenarios/flows/backdate.ts`** — scenario that exercises stock-level and reservation reads/writes under backdated timestamps.

## Notes

- **`available` is stored, not derived.** It is kept in lockstep by `$inc` in the service; the guard conditions in `reserve`/`adjust` guarantee it never goes negative. Storing it (rather than computing `onHand - reserved` at read time) lets the stock-board index narrow the result set before an in-memory tie-break sort.
- **No Mongo TTL index on reservations.** Deletion would lose the units that still need giving back. Expiry is handled by a sweep (`runReservationSweep`) that reads `{status:'held', expiresAt: …}` and transitions the document.
- **Reservation `items` are embedded, not referenced.** This avoids an inventory → orders → inventory cycle and records what was actually taken (not what the order says today).
- **Products carries a synced copy of stock counters** for join-free catalogue reads, but this module never writes to or reads from that copy.
- **Index names are explicit** (e.g. `stockmovements_productId_createdAt`) because Mongo identifies indexes by name; a name mismatch causes a startup failure rather than a silent no-op.
