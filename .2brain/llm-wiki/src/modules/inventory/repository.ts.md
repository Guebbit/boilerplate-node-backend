---
source: src/modules/inventory/repository.ts
sha256: 08629c22fb89491031ecb661e3dcc46845f997725160e64c37e36a61d8c372ab
generated_at: 2026-10-29T04:02:21.485028+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/repository.ts

## Purpose

The data-access layer for the inventory module. It owns reads and writes against the three Mongo collections (`stockLevel`, `stockMovement`, `reservation`) and translates domain-level transitions (reserve, ship, release, backorder, allocate, etc.) into conditional counter updates. Business rules live in `./services`; this file only enforces the atomic "guard-then-write" step and keeps `available` in sync with `onHand`/`reserved`.

## Key elements

- **`conditionFor`** (private) – Maps a `StockMovementReason` + `HoldKind` + `uncapped` flag to a Mongo `QueryFilter`. Each reason gets a different guard: `reserve` checks `available`, `ship` checks both `onHand` and `reserved`, `backorder` respects `backorderLimit` (with `$type: 'null'` vs absent-field subtlety), `adjust` ensures the post-change `onHand` stays ≥ `reserved`. This is the single place raw Mongo filter syntax appears.
- **`stockLevelRepository`** (exported) – The primary repository object. Extends the generic `Repository` from `createRepository` with domain-specific methods:
  - `insertIfAbsent` – Idempotent zero-row upsert (safe under concurrent `PRODUCT_CREATED` redelivery).
  - `applyDelta` – Conditional counter write: applies a `CounterDelta` only if `conditionFor` matches; returns `true`/`false` for success/failure.
  - `setBackorderLimit` – Updates the per-product backorder ceiling.
  - `preorderBoard` / `stockBoard` – Paginated read queries returning counters only (`StockLevelRow` / `PreorderLevelRow`); product titles are joined by the caller via `products` service.
  - `lowAvailabilityProductIds` – Returns product IDs whose `available` is at or below a threshold.
  - `sumReserved` – Global reserved total.
- **`StockLevelRow`** / **`PreorderLevelRow`** (exported interfaces) – Row shapes for the two admin boards; deliberately contain no product-name fields.
- **`toReservationItems`** (private) – Converts string product IDs to `Types.ObjectId` for storage.
- **`orderedByProduct`** (private) – Aggregates lifetime backorder claims from the `stockMovement` ledger.
- **`outstandingByProduct`** (private) – Aggregates outstanding hold units from `reservation`, split by `held` (unpaid) vs `committed` (paid).

## Relationships

- **`./model.ts`** – Source of the three Mongoose models, their document types, and the `apply*Transform` functions used by `createRepository`.
- **`./domain/index.ts`** – Supplies `withAdded`, `CounterDelta`, and `HoldKind` types consumed by `applyDelta` and `conditionFor`.
- **`./domain/transitions.ts`** – Defines `counterDeltaFor` (reason → delta table) that `conditionFor` stays manually in sync with; both must agree on which counters a transition touches.
- **`./services/admin.ts`** – Primary caller; composes `applyDelta`, board queries, and `insertIfAbsent` into service-level operations.
- **`@infrastructure/persistence/create-repository.ts`** – Provides the generic `Repository` base, `toObjectId` helper, and the `Wire`/`Lean`/`AppendOnlyLedger` type utilities.
- **`@infrastructure/persistence/conditional-status.ts`** – Imported as `conditionalStatus` (`updateStatusIfIn`); used for status-guarded updates on the reservation collection.
- **`@infrastructure/persistence/mongo-errors.ts`** – `isDuplicateKey` is used to detect unique-index violations (e.g., double-booking a reservation).
- **`./hold-lines.ts`** – Domain logic for hold line manipulation; feeds the line arrays that `toReservationItems` persists.
- **`./metrics.ts`** – Reads repository data (or is called by services that do) to emit inventory gauges.
- **Cart & delivery integration tests** (e.g., `checkout-stock-divergence.test.ts`, `lost-parcel.test.ts`) – Exercise `applyDelta` under concurrent/edge-case scenarios (stock race, lost-parcel release against `backordered`).

## Notes

- **Explicit type exports are intentional.** Mongoose's inferred generics are too large for TS to serialize at an export boundary (TS7056), so every public type is written out by hand. Do not "simplify" these to inferred forms.
- **`conditionFor` stays in the repository, not in `services/`.** This keeps `QueryFilter` a repository-only import, so a service can never pass a raw Mongo condition directly to the data layer.
- **`conditionFor` and `counterDeltaFor` are kept in sync by hand.** There is no automated test that asserts they agree; `tests/unit/transitions.test.ts` covers `counterDeltaFor` only. Adding a new reason requires updating both.
- **`backorderLimit` null vs. absent:** `$type: 'null'` matches only an explicitly stored `null`; a missing field is treated as `0` (capped) via `$ifNull`. An explicit `null` means "no cap." Do not collapse these two cases.
- **Boards return counters only.** Product names, dates, etc. are resolved by the calling service via the `products` module—there is no cross-module DB join in this file.
