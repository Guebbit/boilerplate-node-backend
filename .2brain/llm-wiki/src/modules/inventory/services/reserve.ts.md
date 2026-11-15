---
source: src/modules/inventory/services/reserve.ts
sha256: 2520c40f12d8a6a5da72813f6d42823b9ee03ce91f50986af87316c348db0d4d
generated_at: 2026-11-14T20:07:09.665996+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/reserve.ts

## Purpose

Implements the all-or-nothing "reserve stock for an order" operation. For each order line it atomically decrements shelf or backorder counters within a single transaction, records the take on a durable hold, and either commits the full reservation or unwinds every line taken so far. Exists to guarantee that a checkout never half-holds inventory and that concurrent multi-line checkouts cannot deadlock.

## Key elements

- **`reserveForOrder(orderId, lines, holdMinutes?)`** — Exported entry point. Inserts an empty hold (exactly-once guard via unique `orderId`), then takes each line in lock order. Returns `{ held: true, expiresAt, owed }` or `{ held: false, shortfalls }`.
- **`takeLine(orderId, line)`** — Takes a single line in a transaction: applies the stock transition, then pushes the part onto the hold. Returns `null` on counter refusal. Delegates to `takeSpillLine` for spilling lines.
- **`takeSpillLine(orderId, line)`** — Handles a line that overflows from shelf into backorder in one transaction. Falls back to shelf-then-backorder split when the full quantity doesn't fit on the shelf.
- **`pushed(orderId, parts, session)`** — Appends just-taken parts to the hold inside the same transaction; throws `HoldClaimed` if the hold was already claimed (aborting the transaction).
- **`giveBack(orderId)`** — Releases all parts an unfinished reserve took. Logs failures rather than throwing so the caller still reports the original refusal.
- **`inLockOrder(lines)`** — Returns a copy sorted by `productId` (locale `'en'`) to enforce a consistent acquisition order and prevent multi-line deadlocks.
- **`leftFor(line, level)`** — Computes how many units remain for a refused line (shelf, allowance, or combined for spilling lines).
- **`owedPartsOf(line, parts)`** — Extracts the backorder-shaped parts from a line's taken parts (only for lines originally asked as shelf units).
- **`OwedRefused` / `HoldClaimed`** — Sentinel error classes thrown inside transactions to force rollback; caught by the surrounding `withTransaction` wrapper.

## Relationships

- **`src/modules/inventory/services/transition.ts`** — Provides `applyTransition` (the counter movement) and `refreshStockCache` (catalogue update written *outside* the transaction by design).
- **`src/modules/inventory/services/holds.ts`** — Provides `releaseForOrder`, called by `giveBack` to unwind a failed reserve.
- **`src/modules/inventory/repository.ts`** — Provides `reservationRepository` (hold insert/push/find) and `stockLevelRepository` (authoritative level reads).
- **`src/modules/inventory/domain/index.ts`** — Provides `roomOn` for remaining backorder capacity.
- **`src/modules/inventory/config.ts`** — Provides `reservationTtlMinutes()` as the default hold duration.
- **`src/modules/inventory/services/types.ts`** — Provides `StockLine`, `StockShortfall`, `ReserveOutcome` shapes.
- **`src/modules/inventory/model.ts`** — Provides `StockLevelDocument` type for level lookups.
- **`src/infrastructure/runtime/database.ts`** — Provides `withTransaction` wrapping each line's take so counter movement and hold update are atomic.
- **`src/infrastructure/adapters/logger.ts`** — Provides `logger`, used in `giveBack` to record rollback failures.
- **`src/domain-primitives/time.ts`** — Provides `MINUTE_MS` for computing `expiresAt`.
- **`src/modules/products/index.ts`** — Provides `productService`, used to fetch the product title for the shortfall report.

## Notes

- **Exactly-once via empty hold insert.** The first `insertHold(orderId, [], …)` with a unique key is the idempotency guard; a retry gets `null` and reads back the *original* expiry rather than the freshly computed one.
- **Hold is never deleted.** On failure it transitions to `released`; if the release itself throws it stays `held` so a background sweep can free it later. This avoids double-give-back.
- **`refreshStockCache` is outside the transaction.** The product catalogue's synced copy cannot be rolled back, so it is written after the transaction commits.
- **`leftFor` reads the inventory module's own level**, not the product's synced copy, because the latter can lag by one transition.
- **Lock ordering is critical.** Two orders listing the same products in opposite order would deadlock without the `inLockOrder` sort (see the PostgreSQL locking docs referenced in the comment).
- **Spilling lines are one transaction.** The shelf take, the backorder claim, and the hold update all commit or all roll back together; a partial success is impossible.
- **The `for…of` loop in `reserveForOrder` is intentional.** Each line may need partial rollback of only the lines taken so far, which no higher-order wrapper can express; the eslint disable documents this.
