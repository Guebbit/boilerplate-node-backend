---
source: src/modules/inventory/repository.ts
sha256: e870957204f700f46832fa149c92df780da13c45dbfee726b263651edcbe452a
generated_at: 2026-10-15T10:35:24.614838+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/repository.ts

## Purpose

Persistence boundary for the inventory module. It owns the three MongoDB collections (stock levels, stock movement ledger, reservations), defines the Mongo-level conditional write guards for every stock transition, and exposes repository methods that the service layer calls. By keeping `QueryFilter` and `ObjectId` inside this file, services are limited to asking for counter mutations and can never pass a raw Mongo condition downstream.

## Key elements

- **`conditionFor(reason, quantity, kind)`** — Maps each `StockMovementReason` to a `QueryFilter<StockLevelDocument>` that `applyDelta` must match before a write succeeds. Encodes the invariant per transition (e.g. `ship` requires both `onHand` and `reserved` ≥ quantity; `preorder` checks `preorderLimit` via `$expr`; `adjust` ensures `onHand + delta ≥ reserved`).
- **`stockLevelRepository`** — The main exported repository. Extends the generic `Repository` (CRUD via `createRepository`) with domain-specific methods: `insertIfAbsent`, `findByProductId`, `applyDelta`, `setPreorderLimit`, `stockBoard`, `preorderBoard`, `lowAvailabilityProductIds`, `sumReserved`, `deleteByProductId`, `findManyByProductIds`.
- **`StockLevelRow` / `PreorderLevelRow`** — Row shapes returned by the board queries. Contain counters only; product metadata (title, dates) is resolved by `services/levels.ts` calling `productService.findManyByIds` (API composition, not a DB join).
- **`toReservationItems(lines)`** — Converts service-level `{ productId: string }` lines to storage shape with real `Types.ObjectId`s.
- **`orderedByProduct(productIds)`** — Aggregates the stock-movement ledger for lifetime `preorder` units per product.
- **`outstandingByProduct(productIds)`** — Aggregates open reservations (`held` / `committed`) split by payment state for the preorder board.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — Supplies `createRepository`, `toObjectId`, and the `Repository`, `AppendOnlyLedger`, `Wire`, `Lean` types that define the base CRUD surface and the wire/lean document split.
- **`src/infrastructure/persistence/mongo-errors.ts`** — Provides `isDuplicateKey`, used to detect races on the unique `productId` index.
- **`src/modules/inventory/model.ts`** — Source of the Mongoose models (`stockLevelModel`, `stockMovementModel`, `reservationModel`), document types, and `apply*Transform` functions passed to `createRepository`.
- **`src/modules/inventory/domain/index.ts`** — Provides the `CounterDelta` and `HoldKind` types used in `conditionFor` and `applyDelta` signatures.
- **`src/modules/inventory/domain/transitions.ts`** — `counterDeltaFor` is the reason→deltas table that `conditionFor` must stay consistent with (manual invariant; no shared test).
- **`src/modules/inventory/services/allocate.ts`, `reserve.ts`, `holds.ts`, `levels.ts`, `sweep.ts`, `transition.ts`, `admin.ts`** — Consumers of `stockLevelRepository`; they pick a transition reason, compute the delta, and call `applyDelta` without ever constructing a Mongo filter.
- **`src/modules/inventory/metrics.ts`** — Reads counters via the repository for operational metrics.
- **`src/modules/inventory/tests/integration/hold-crash-window.test.ts`** — Exercises the reservation and level writes through this repository under simulated crash/retry conditions.

## Notes

- **`conditionFor` is a manual invariant.** It must stay in lockstep with `counterDeltaFor` in `domain/transitions.ts` by hand. There is no automated test that checks the two agree; `tests/unit/transitions.test.ts` covers `counterDeltaFor` only.
- **`ship` and `adjust` guard on `onHand`/`reserved` directly**, not on `available`, because their invariants are about the underlying physical and promised quantities, not the derived difference.
- **`insertIfAbsent` is idempotent** via the unique index on `productId`; the boolean return tells the caller whether *this* call created the row (used to book opening stock exactly once on redelivered `PRODUCT_CREATED`).
- **`deleteByProductId` removes only the stock-level row.** The stock-movement ledger is intentionally left intact — it is history and must remain true even after a product is gone.
- **Preorder fields (`preordered`, `preorderLimit`) may be absent** on documents written before the feature existed; `conditionFor` guards against this with `$ifNull`.
- All exported types are written out explicitly (not inferred) because Mongoose generics are too large for TS to serialize at an export boundary (TS7056).
