---
source: src/modules/inventory/repository.ts
sha256: 0bae2ee917d8ef5c2b7c597e93236eaf88188b6c938a215168e95070ead4e558
generated_at: 2026-11-08T06:01:10.224307+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/repository.ts

## Purpose

Persistence and read layer for the inventory module. Owns the three Mongo collections (stock levels, stock movements, reservations), translates service-level stock transitions into conditionally-guarded atomic writes, and provides paginated read APIs for the stock and preorder boards. All business rules live in `./services`; this file only applies them and keeps the `available` counter in step.

## Key elements

- **`conditionFor`** (private) — Maps a `StockMovementReason` + quantity + `HoldKind` to a Mongo `QueryFilter` that guards the write. Encapsulates per-transition invariants (e.g. `ship` requires both `onHand` and `reserved` ≥ qty; `backorder` respects `backorderLimit`).
- **`StockLevelRow`** / **`PreorderLevelRow`** — Exported read-shape interfaces. Carries counters only; product display fields (title, etc.) are composed by the caller from the `products` module, not joined here.
- **`toReservationItems`** (private) — Converts string product IDs in hold lines to `Types.ObjectId` for storage.
- **`orderedByProduct`** (private) — Aggregates lifetime preorder units per product from the movement ledger (`reason: backorder` rows).
- **`outstandingByProduct`** (private) — Aggregates outstanding preorder units per product, split into `held` (unpaid) and `committed` (paid) buckets.
- **`stockLevelRepository`** — Main exported object. Extends the generic `Repository` with: `insertIfAbsent`, `findManyByProductIds`, `findByProductId`, `deleteByProductId`, `applyDelta`, `setBackorderLimit`, `preorderBoard`, `stockBoard`, `lowAvailabilityProductIds`, `sumReserved`.

## Relationships

- **`./model`** — Source of the three Mongoose models (`stockLevelModel`, `stockMovementModel`, `reservationModel`), their transforms, document types, and `ReservationStatus`.
- **`@infrastructure/persistence/create-repository`** — Provides the generic `createRepository` factory, `toObjectId`, and the `Repository` / `Wire` / `AppendOnlyLedger` / `Lean` type contracts this file implements.
- **`@infrastructure/persistence/conditional-status`** — Supplies `updateStatusIfIn`, used for guarded reservation status transitions (e.g. `held` → `committed`).
- **`@infrastructure/persistence/mongo-errors`** — Supplies `isDuplicateKey` for detecting unique-index collisions on writes.
- **`./domain`** (`hold-lines.ts`, `transitions.ts`, `index.ts`) — Provides `CounterDelta`, `HoldKind`, `withAdded`, and the `counterDeltaFor` reason→deltas table that `applyDelta` consumes. The invariant between `conditionFor` and `counterDeltaFor` is maintained by hand.
- **`./services/admin.ts`** — Consumes `stockLevelRepository` for admin-facing stock operations.
- **`./presenter.ts`** — Formats repository output (board rows) for API responses.
- **`./metrics.ts`** — Emits inventory metrics alongside repository reads.
- **Cart / delivery integration tests** (`checkout-interleavings`, `checkout-stock-divergence`, `product-removal-protects-orders`, `lost-parcel`, `fulfillment`) — Exercise the conditional-write paths and board reads through service-layer calls into this repository.

## Notes

- **TS7056 workaround:** All exported types are written out explicitly rather than inferred from Mongoose generics, because TypeScript cannot serialize an inferred generic at an export boundary.
- **`QueryFilter` is repository-private:** `conditionFor` lives here (not in `services/`) so that no service can pass a raw Mongo condition to the write path; services only name a transition and quantity.
- **`backorderLimit` null vs. absent:** The `backorder` filter uses `$type: 'null'` to match an explicitly-stored `null` (no cap). An *absent* field is treated as `0` (closed) via `$ifNull`. Using `{ backorderLimit: null }` instead would incorrectly match absent fields.
- **Manual invariant:** `conditionFor` and `counterDeltaFor` (in `./domain`) must stay in step, but there is no automated test linking them. `tests/unit/transitions.test.ts` covers only `counterDeltaFor`.
- **`insertIfAbsent` idempotency:** Relies on the unique index on `productId`; a racing redelivery is a safe no-op. The `upsertedCount > 0` return lets callers book opening stock exactly once.
