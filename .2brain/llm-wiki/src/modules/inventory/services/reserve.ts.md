---
source: src/modules/inventory/services/reserve.ts
sha256: c64bd137549fe05003f43569d58ff023c0c63ef3e86fe9ea3b9913ce3e2c5868
generated_at: 2026-11-08T06:03:18.313288+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/reserve.ts

## Purpose

Implements the "reserve stock for an order" operation: all lines are held atomically or none are. Handles three line shapes (plain shelf, backorder, and spilling) and provides a crash-safe rollback path that gives back only what was actually taken before deleting the hold.

## Key elements

- **`reserveForOrder`** *(exported)* — Entry point. Inserts the hold document, then takes each line in lock order. Returns `ReserveOutcome` (`held`, `expiresAt`, `owed`, or a `shortfall` with the product's actual remaining quantity).
- **`giveBackAndDeleteHold`** — Shared unwinding: narrows the hold to `taken` first, releases each line via `applyTransition` (logged, never throwing), then deletes the hold document.
- **`inLockOrder`** — Sorts lines by `productId` with a fixed-locale `localeCompare` so concurrent multi-line checkouts acquire locks in the same order (deadlock prevention).
- **`takeReasonFor`** — Maps a line to `StockMovementReason.reserve` or `.backorder` based on `line.kind`.
- **`takeSpillLine`** — Runs a single DB transaction: tries the full quantity from shelf; if that fails, splits into a shelf part + a backorder claim, rewrites the hold's items, and throws `OwedRefused` to abort if either sub-take is refused. Calls `refreshStockCache` *outside* the transaction.
- **`takeLine`** — Dispatcher: delegates to `takeSpillLine` for spilling lines, otherwise a single `applyTransition` call.
- **`leftFor`** — Computes the quantity still available for a refused line (shelf, backorder, or both for a spilling line).
- **`OwedRefused`** — Internal `Error` subclass used purely as a transaction-abort signal inside `takeSpillLine`.
- **`owedPartsOf`** — Extracts the backorder portions from the taken parts of a spilling line.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — `logger.error` is called when a release or hold-deletion fails during rollback.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` provides the session for `takeSpillLine`'s atomic multi-write.
- **`src/modules/inventory/services/transition.ts`** — `applyTransition` performs each individual counter change; `refreshStockCache` updates the catalogue's cached stock after a successful take.
- **`src/modules/inventory/repository.ts`** — `reservationRepository` (insert/narrow/find/delete holds) and `stockLevelRepository` (read availability) are the persistence layer for all reads and writes here.
- **`src/modules/inventory/model.ts`** — `ReservationDocument` and `StockLevelDocument` shape the data read and written.
- **`src/modules/inventory/services/types.ts`** — `StockLine`, `StockShortfall`, `ReserveOutcome` define the in/out contracts.
- **`src/modules/inventory/config.ts`** — `reservationTtlMinutes()` supplies the default hold TTL.
- **`src/modules/inventory/domain/index.ts`** — `roomOn` computes remaining backorder capacity for a level document.
- **`src/modules/products/index.ts`** — `productService.findByIdRaw` fetches the product title for the shortfall report.
- **`src/types/index.ts`** — `StockMovementReason` enum values drive every counter transition.
- **`src/domain-primitives/time.ts`** — `MINUTE_MS` converts the TTL to a millisecond expiry.
- **`src/modules/inventory/services/index.ts`** — Re-exports `reserveForOrder` as the public API of the services barrel.

## Notes

- **Lock order is load-bearing.** Lines are always sorted by product ID before any write; removing `inLockOrder` reintroduces the two-order deadlock described in the PG docs link in the source.
- **Rollback narrows before it releases.** `reservationRepository.narrowToTaken` runs before any counter is decremented, so a crash mid-rollback can never leave a hold naming lines whose counters were untouched.
- **`refreshStockCache` is intentionally outside the transaction** because the catalogue's copy is a separate write that cannot roll back with the stock ledger.
- **Retried checkout path:** if `insertHold` returns `null` (unique-constraint hit), the function reads the *existing* hold's `expiresAt` rather than the freshly computed one, so a double-click reports the original window.
- **`OwedRefused` is not a domain error.** It is a private control-flow signal caught only inside `takeSpillLine`; it never escapes to callers.
- The `try`/`catch` block around the line loop has an explicit `eslint-disable no-restricted-syntax` because no wrapper can express "give back only what was taken, then rethrow."
