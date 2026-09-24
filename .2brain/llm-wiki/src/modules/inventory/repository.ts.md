---
source: src/modules/inventory/repository.ts
sha256: 0cefeb942e389bb8869bbbb4cafed3abad4f5028fb5e8e849e960f5ac6579b34
generated_at: 2026-09-23T18:45:49.134730+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/repository.ts

## Purpose

The data-access layer for the inventory module. It owns three Mongoose collections (stock levels, stock movements, reservations) and exposes typed repository objects that the service layer calls to read and write counters, append ledger entries, and drive reservation lifecycle transitions. Business rules and transition conditions live in `./service.ts`; this file only executes the database operations.

## Key elements

- **`StockLevelRow`** (exported interface) — the shape of one stock-board entry: `productId`, `onHand`, `reserved`, `available`. Deliberately contains no product fields.
- **`toReservationItems`** (private helper) — converts string product IDs to `Types.ObjectId` for the items array on a reservation document.
- **`stockLevelRepository`** — extends the generic `Repository` with:
    - `ensure(productId)` — upserts a zero-count row on first `PRODUCT_CREATED`; safe under redelivery via the unique index on `productId`.
    - `findByProductId(productId)` — single-row lookup.
    - `deleteByProductId(productId)` — hard-delete cascade only; leaves the stock-movement ledger untouched.
    - `applyDelta(productId, condition, delta)` — the module's sole write primitive; conditionally `$inc`s `onHand`, `reserved`, and `available` in one atomic update. Returns `boolean` (did the condition match).
    - `stockBoard({ skip, limit, maxAvailable })` — paginated read sorted by `available` asc then `_id`; returns titleless `StockLevelRow[]` + `totalItems`.
    - `lowAvailabilityProductIds(threshold)` — all product IDs with `available ≤ threshold`, unfiltered by visibility.
    - `sumReserved()` — aggregate sum of all `reserved` units catalogue-wide.
- **`stockMovementRepository`** — append-only ledger; exposes only `create` and `search` (inherited from `createRepository`). No update or delete surface. Searchable by `productId` (ObjectId) and `reason` (exact string match).
- **`reservationRepository`** — extends the generic `Repository` with:
    - `insertHold(orderId, items, expiresAt)` — creates a held reservation; returns `null` on duplicate-key (code 11000) rather than throwing.
    - `findByOrderId(orderId)` — read a hold in any status.
    - `claimStatus(orderId, from, to)` — conditional status transition (e.g. `held → confirmed`, `held → released`).
    - `findExpired(now, limit)` — batch fetch of holds past their `expiresAt`.

## Relationships

- **`./model.ts`** — source of all Mongoose models (`stockLevelModel`, `stockMovementModel`, `reservationModel`), document types, and `apply*Transform` functions passed into `createRepository`.
- **`@infrastructure/persistence/create-repository`** — provides the generic `createRepository` factory, the `Repository` / `Wire` / `Lean` type helpers, and `toObjectId`. Every repository in this file spreads its return value.
- **`@infrastructure/persistence/mongo-errors`** — `isDuplicateKey` is used in `insertHold` to convert a Mongo 11000 error into a `null` return.
- **`./domain/index.ts`** — supplies the `CounterDelta` type consumed by `applyDelta`.
- **`./domain/transitions.ts`** — defines the transition vocabulary whose conditions are passed as the `condition` argument to `applyDelta` by the service.
- **`./service.ts`** — the sole caller of every custom method. It owns per-transition conditions, composes API reads (e.g. asking `productService` for display titles after `stockBoard` returns), and drives reservation state changes.
- **`./metrics.ts`** — reads `stockLevelRepository` / `stockMovementRepository` for gauge and counter metrics.
- **Tests** — `repository.test.ts` exercises the custom methods in isolation; `service.test.ts` and `ledger.property.test.ts` test them through the service; `product-removal-protects-orders.test.ts` verifies `deleteByProductId` does not corrupt open holds or the ledger.

## Notes

- **`available` is maintained inside the same `$inc`** as `onHand` and `reserved` (`onHandDelta - reservedDelta`), not recomputed in a second query. Callers never need to restate the arithmetic.
- **No cross-module database joins.** `stockBoard` and `lowAvailabilityProductIds` return raw IDs; the service layer fetches product names/visibility through `productService`. This is an intentional API-composition boundary, not an oversight.
- **Explicit type exports** at the `Repository` boundary exist because Mongoose generics are too large for TypeScript to serialize an inferred type at an export position (TS7056).
- **`stockMovementRepository` is deliberately immutable.** There is no update or delete method; the ledger is a historical trail.
- **`insertHold` returns `null` on duplicate** rather than throwing, so two racing checkouts for the same order resolve without error handling at the call site.
- **`stockBoard` sorts by `_id` as tiebreaker**, not by product name, because titles are fetched after the page is settled (one round-trip too late to sort by them).
