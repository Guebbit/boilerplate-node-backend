---
source: src/modules/inventory/repository.ts
sha256: 4ad0c73b98b770a8bf75c289308a58b88617dd717c232a5e8f463b0492abfb3a
generated_at: 2026-10-14T15:56:07.778719+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/repository.ts

## Purpose

Repository layer for the inventory module's three MongoDB collections (stock levels, stock movements, reservations). It exposes typed, session-aware query/mutation methods so that the service layer can request state transitions without ever touching raw Mongoose models or constructing Mongo filters directly. All conditional writes (e.g. "only decrement if `available >= qty`") are defined here, keeping `QueryFilter` a repository-internal concern.

## Key elements

- **`conditionFor(reason, quantity, kind)`** (private) — Maps a `StockMovementReason` + quantity + `HoldKind` to a Mongo `QueryFilter<StockLevelDocument>`. Each branch encodes the invariant the transition must satisfy (e.g. `ship` guards both `onHand` and `reserved`; `preorder` uses `$expr`/`$ifNull` to handle documents predating the preorder fields).
- **`stockLevelRepository`** (exported) — The main repository object. Spreads the generic `createRepository` base, then adds domain-specific methods:
  - `ensure` / `insertIfAbsent` — Idempotent row creation at zero counters; `insertIfAbsent` returns whether *this* call created the row (used to book opening stock exactly once on redelivered `PRODUCT_CREATED`).
  - `applyDelta` — Conditional counter update driven by `conditionFor` + a `CounterDelta`; returns a boolean for success/failure.
  - `setPreorderLimit`, `preorderBoard`, `stockBoard` — Admin/board reads with pagination; `preorderBoard` composes `orderedByProduct` (ledger aggregate) and `outstandingByProduct` (reservation aggregate).
  - `lowAvailabilityProductIds`, `sumReserved` — Quick aggregate helpers for metrics/alerting.
  - `findManyByProductIds`, `findByProductId`, `deleteByProductId` — Standard CRUD reads/writes.
- **`StockLevelRow`** (exported interface) — One product's counters as displayed on the stock board; deliberately excludes product fields (title, etc.).
- **`PreorderLevelRow`** (exported interface) — Preorder counters plus the `held`/`paid` split of outstanding units.
- **`toReservationItems`** (private) — Converts service-carried string product IDs to `Types.ObjectId` lines with a default `kind: 'stock'`.
- **`orderedByProduct`** (private) — Aggregates lifetime `preorder` deltas from the stock-movement ledger.
- **`outstandingByProduct`** (private) — Aggregates active `held`/`committed` reservation items split by payment state.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — Supplies the generic `createRepository` factory, `toObjectId` helper, and the `Repository` / `Wire` / `Lean` / `AppendOnlyLedger` types that shape this file's exported interfaces.
- **`src/infrastructure/persistence/mongo-errors.ts`** — Provides `isDuplicateKey`, used to distinguish unique-index violations from other write failures.
- **`src/modules/inventory/model.ts`** — Source of all three Mongoose models (`stockLevelModel`, `stockMovementModel`, `reservationModel`), their document types, and the `apply*Transform` functions passed to `createRepository`.
- **`src/modules/inventory/domain/index.ts`** — Exports `CounterDelta` and `HoldKind`, the domain-level types this repository interprets when building filters and deltas.
- **`src/modules/inventory/domain/transitions.ts`** — Defines `counterDeltaFor` (reason → per-field deltas). `conditionFor` must stay manually in step with that table; there is no automated cross-check.
- **`src/modules/inventory/services/levels.ts`** — Calls `stockBoard` / `preorderBoard` and then enriches the returned rows with product names via the products service (API composition, not a DB join).
- **`src/modules/inventory/services/reserve.ts`**, **`allocate.ts`**, **`sweep.ts`**, **`transition.ts`**, **`holds.ts`**, **`admin.ts`** — Service callers that invoke `applyDelta`, `setPreorderLimit`, reservation CRUD, and board queries through `stockLevelRepository`.
- **`src/modules/inventory/tests/integration/hold-crash-window.test.ts`** — Exercises the `ensure` / `insertIfAbsent` idempotency path and `applyDelta` conditional writes under simulated crash/retry scenarios.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Integration-level test that drives the `ship` transition path through this repository.

## Notes

- **Manual invariant between `conditionFor` and `counterDeltaFor`:** There is no test that verifies the two stay consistent. If you add a new `StockMovementReason`, you must update *both* `conditionFor` (the filter) and the `counterDeltaFor` table (the deltas) in lockstep.
- **`$ifNull` on preorder fields:** Documents written before preorders existed lack `preordered` and `preorderLimit`. The `preorder` and `adjust` filter branches use `$ifNull` to treat missing fields as `0`.
- **`available` is derived, not stored independently:** The repository keeps `available = onHand − reserved` in sync on every `applyDelta`. Reads that need `available` should trust the stored value; do not recompute it in a service.
- **TS7056 workaround:** All exported types are written out explicitly (see `StockLevelRow`, `PreorderLevelRow`, the `stockLevelRepository` type annotation) because Mongoose's generics produce inferred types too large for TypeScript to emit at an export boundary. Do not "simplify" to `ReturnType<…>` or inferred generics.
- **No product fields in rows:** This repository intentionally returns counters only. Product names/dates are joined at the service or API layer, keeping the module boundary clean.
