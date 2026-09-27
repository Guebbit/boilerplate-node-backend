---
source: src/modules/inventory/repository.ts
sha256: af856099e1a5e3860a91e2d3d1176338ac7c2a7a310365f9056f5e7407181797
generated_at: 2026-09-27T14:56:04.945925+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/repository.ts

## Purpose

Persistence layer for the inventory module. It exposes three typed repositories (stock levels, stock movements, reservations) that translate the service layer's domain operations into conditional Mongoose writes. All guard logic for counter transitions lives here so the service never touches raw Mongo filters.

## Key elements

- **`conditionFor(reason, quantity)`** — Maps a `StockMovementReason` + quantity to a `QueryFilter` that `applyDelta` must match before counters move. Each reason encodes the invariant it protects (e.g. `commit` requires both `onHand ≥ q` and `reserved ≥ q`; `adjust` uses `$expr` to ensure `onHand + q ≥ reserved`).
- **`StockLevelRow`** — Exported interface for one row of the stock board: `productId`, `onHand`, `reserved`, `available`. Deliberately carries no product fields.
- **`toReservationItems(lines)`** — Converts string `productId` values to `Types.ObjectId` for reservation document storage.
- **`stockLevelRepository`** — The primary repository. Extends the generic `Repository` (create/update/find/delete) with:
  - `ensure(productId)` — upserts a zeroed row; safe under redelivery thanks to the unique index.
  - `findByProductId` / `deleteByProductId` — direct lookup and hard-delete cascade (never called on soft-delete).
  - `applyDelta(productId, reason, quantity, delta)` — the module's single write primitive; applies a conditional `$inc` to `onHand`, `reserved`, and `available` atomically; returns `boolean` for whether the guard matched.
  - `stockBoard({ skip, limit, maxAvailable })` — paginated, scarcity-sorted page + total count.
  - `lowAvailabilityProductIds(threshold)` — product IDs at or below a given `available` count.
  - `sumReserved()` — aggregate total of all reserved units.
- **`stockMovementRepository`** — Append-only ledger typed as `AppendOnlyLedger` (exposes `create` + `search` only; `deleteOne` is a compile-time error). Search supports exact-match on `reason` and ObjectId lookup on `productId`.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — Provides the generic `createRepository` factory, `toObjectId` helper, and the `Repository` / `AppendOnlyLedger` / `Wire` / `Lean` types that shape every export in this file.
- **`src/infrastructure/persistence/mongo-errors.ts`** — Supplies `isDuplicateKey`, used to distinguish duplicate-key rejections (e.g. double-reservation) from other Mongo errors.
- **`src/modules/inventory/model.ts`** — Source of the three Mongoose models, their `apply*Transform` functions, and the document/status types this file imports.
- **`src/modules/inventory/domain/index.ts`** — Exports `CounterDelta` (the `{ onHandDelta, reservedDelta }` pair) that `applyDelta` consumes.
- **`src/modules/inventory/domain/transitions.ts`** — Defines `counterDeltaFor`; `conditionFor` in this file is the hand-kept Mongo-side counterpart to that table.
- **`src/modules/inventory/service.ts`** — The sole consumer. Calls `ensure`, `applyDelta`, `stockBoard`, `lowAvailabilityProductIds`, `sumReserved`, and the reservation/ledger methods; composes product-name lookups from its own service (no DB join).
- **`src/modules/inventory/metrics.ts`** — Reads counters (e.g. `sumReserved`, stock-board data) for monitoring/alerting.
- **`src/types/index.ts`** — Defines `StockMovementReason` and `StockMovement` used throughout.
- **`tests/integration/product-removal-protects-orders.test.ts`** — Verifies that `deleteByProductId` respects the cascade contract (level row removed, ledger preserved).
- **`src/modules/inventory/tests/integration/repository.test.ts`** — Direct integration tests for every exported method.
- **`src/modules/inventory/tests/integration/ledger.property.test.ts`** — Property-based tests confirming append-only semantics.
- **`src/modules/inventory/tests/integration/service.test.ts`** — Exercises this file indirectly through the service layer.

## Notes

- `conditionFor` and `counterDeltaFor` (in `domain/`) are kept in step **by hand**. No automated test asserts that the Mongo guard and the delta table agree; a mismatch would silently allow an over-commit or block a valid correction.
- `available` is maintained inside the same `$inc` as `onHand`/`reserved` (`delta.onHandDelta − delta.reservedDelta`), never recomputed in a second query — this is what makes `applyDelta` a single round-trip.
- `stockBoard` sorts by `available` then `_id`. Product names are fetched *after* paging via `productService.findManyByIds`; you cannot sort by name at this layer.
- `stockMovementRepository` is intentionally typed `AppendOnlyLedger`, not `Repository`, so any accidental `.deleteOne()` call fails at compile time.
- Mongoose's generics are too large for TypeScript to infer across an export boundary (TS7056); all exported types are therefore written out explicitly rather than left to inference.
- `deleteByProductId` removes only the `stocklevels` row. The `stockmovements` ledger is never touched — history must survive product deletion.
