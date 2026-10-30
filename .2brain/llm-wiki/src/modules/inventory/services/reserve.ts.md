---
source: src/modules/inventory/services/reserve.ts
sha256: 7f7cccfeb04408c16f195a4e286829003b03eea3445b5ce54c097559ecbee09b
generated_at: 2026-10-29T04:04:21.714214+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/reserve.ts

## Purpose

Implements the all-or-none stock reservation (hold) for an order. Either every line in the order is taken from inventory, or none are — partial state is never exposed to the caller. It handles simple shelf reservations, backorder/preorder claims, and "spilling" lines that draw partly from shelf and partly from the backorder cap, all while maintaining a consistent lock order to avoid deadlocks between concurrent checkouts.

## Key elements

- **`reserveForOrder`** *(exported)* — Entry point. Inserts the hold document first (idempotent via unique `orderId`), then takes each line in sorted lock order. Returns `{ held: true, expiresAt, owed }` on success or `{ held: false, shortfalls }` with the actually-available figure read back from this module's own stock level. Accepts an optional `holdMinutes` override (default `reservationTtlMinutes()`).
- **`takeLine`** — Dispatches a single line: delegates to `takeSpillLine` for spilling non-backorder lines, otherwise performs one conditional `applyTransition`. Returns the parts taken or `null` on refusal.
- **`takeSpillLine`** — Runs a multi-step take (shelf part + backorder claim + hold rewrite) inside a single `withTransaction`. Aborts via a sentinel `OwedRefused` error if the cap cannot cover the owed portion, so the shelf part rolls back atomically. Refreshes the product cache *outside* the transaction.
- **`giveBackAndDeleteHold`** — Rollback helper shared by refusal and exception paths. Narrows the hold to the actually-taken lines *before* releasing counters, then releases each line (each release is logged, never thrown), and finally deletes the hold document.
- **`inLockOrder`** — Sorts lines by `productId` (locale-stable `localeCompare`) to impose a single lock acquisition order and prevent multi-line deadlock.
- **`takeReasonFor`** / **`leftFor`** — Map a line to the correct `StockMovementReason` and compute remaining availability (shelf, cap, or both) for shortfall reporting.
- **`owedPartsOf`** — Extracts the backorder-claim parts from a taken line's parts, used to populate the `owed` field in the success result.
- **`OwedRefused`** — Sentinel error class thrown inside the spilling transaction to trigger a clean abort.

## Relationships

- **`./types.ts`** — Provides `StockLine`, `StockShortfall`, and `ReserveOutcome` shapes used throughout.
- **`./transition.ts`** — `applyTransition` is the sole mechanism for moving counters (both take and give-back); `refreshStockCache` is called after a successful spill take.
- **`../repository.ts`** — `reservationRepository` (insert, narrow, find, delete, replace hold) and `stockLevelRepository` (read availability) are the persistence layer.
- **`../config.ts`** — `reservationTtlMinutes()` supplies the default hold expiry.
- **`../domain/index.ts`** — `roomOn` computes remaining backorder capacity for a level document.
- **`../model.ts`** — `ReservationDocument` and `StockLevelDocument` types.
- **`@infrastructure/runtime/database.ts`** — `withTransaction` wraps the spilling-line take in an atomic unit.
- **`@infrastructure/adapters/logger.ts`** — Error logging in the rollback path (failed releases, failed hold deletion).
- **`@modules/products/index.ts`** — `productService.findByIdRaw` reads the product title for the shortfall response.
- **`@types/index.ts`** — `StockMovementReason` enum.
- **`services/index.ts`** — Re-exports `reserveForOrder` for external consumers.
- **`delivery/tests/unit/fulfillment.test.ts`** — Exercises the reservation/fulfillment boundary that depends on the hold semantics defined here.

## Notes

- **Lock order matters.** Lines are always processed sorted by `productId`. Two orders listing the same products in opposite order would otherwise deadlock on the second line. Do not reorder the input before calling `reserveForOrder`.
- **Rollback is exception-safe.** The `try` block around the per-line loop means a thrown error (DB hiccup, not a refusal) still unwinds through `giveBackAndDeleteHold` before rethrowing — no hold survives naming lines that were never actually taken.
- **Shortfall availability is read from this module's stock level**, not the product's synced copy, which can lag by one transition. A deleted product reads as zero available.
- **The hold is written before any counter moves.** A retried checkout simply fails the unique insert and reports the *existing* hold's expiry, not a freshly computed one.
- **Spill-line cache refresh is deliberately outside the transaction** — the product catalogue copy cannot participate in the rollback.
