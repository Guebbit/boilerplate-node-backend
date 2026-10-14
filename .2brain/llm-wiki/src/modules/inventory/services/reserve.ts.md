---
source: src/modules/inventory/services/reserve.ts
sha256: 5c39c5b2cd8f462880be78aace5edf1fe1912b2a1877fd2d04807ac97a01e029
generated_at: 2026-10-14T15:58:59.088227+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/reserve.ts

## Purpose

Implements the all-or-nothing reservation ("hold") of stock lines for an order. Takes every line or none: writes a hold document first as an exactly-once guard, then conditionally decrements each line's stock, rolling back any already-taken lines if a single line is refused or a write throws. Exists so that checkout can atomically claim shelf units or preorder allowance without leaking partial holds or creating deadlock-prone lock orderings.

## Key elements

- **`reserveForOrder(orderId, lines, holdMinutes?)`** (exported) — Entry point. Inserts a hold, iterates lines in lock order, calls `applyTransition` per line. On refusal returns `{ held: false, shortfalls }` after unwinding; on throw unwinds then rethrows; on success returns `{ held: true, expiresAt }`.
- **`giveBackAndDeleteHold(orderId, taken, hold, note)`** (internal) — Rolls back: narrows the hold to only the lines actually taken, releases each via `applyTransition(release, …)` (logging failures rather than propagating), then deletes the hold document.
- **`inLockOrder(lines)`** (internal) — Returns a copy of `lines` sorted by `productId` (locale `'en'`) to impose a single deterministic lock order across workers.
- **`takeReasonFor(line)`** (internal) — Maps `line.kind` to `StockMovementReason.reserve` or `.preorder`.
- **`leftFor(line, level)`** (internal) — Computes the remaining quantity for a refused line: `available` for shelf lines, `preorderLimit − preordered` (floored at 0) for preorder lines.

## Relationships

- **`src/modules/inventory/services/transition.ts`** — Calls `applyTransition` for every take and release; this file is the primary consumer of that module.
- **`src/modules/inventory/repository.ts`** — Uses `reservationRepository` (insertHold, findByOrderId, narrowToTaken, deleteOne) and `stockLevelRepository.findByProductId`.
- **`src/modules/inventory/config.ts`** — Imports `reservationTtlMinutes` as the default hold duration.
- **`src/modules/inventory/model.ts`** — Imports `ReservationDocument` and `StockLevelDocument` types.
- **`src/modules/inventory/services/types.ts`** — Imports `StockLine`, `StockShortfall`, `ReserveOutcome`.
- **`src/modules/inventory/services/index.ts`** — Barrel re-export surface for `reserveForOrder`.
- **`src/infrastructure/adapters/logger.ts`** — Logs errors during rollback so a single failed release doesn't abort the rest.
- **`src/modules/products/index.ts`** — Calls `productService.findByIdRaw` to fetch the product title for the shortfall report.
- **`src/types/index.ts`** — Imports the `StockMovementReason` enum.
- **Integration tests** (`cache-invalidation`, `hold-crash-window`, `multi-line-race`, `preorder`, `service`) — Exercise the hold-insert race, crash-window unwinding, multi-line deadlock avoidance, preorder allowance, and the happy/sad paths respectively.

## Notes

- **Hold-before-take ordering is deliberate.** The unique `orderId` on the hold document is the exactly-once guard: a retried checkout gets `null` from `insertHold` and returns the *existing* hold's `expiresAt`, not a freshly computed one.
- **Rollback narrowing.** `narrowToTaken` runs *before* any release write. A crash mid-cleanup therefore leaves a hold that names only lines whose counters actually moved — never a phantom line.
- **Error isolation in rollback.** Each release `.catch`es and logs; one failed give-back does not prevent the others. The same pattern guards the final `deleteOne`.
- **`// eslint-disable-next-line no-restricted-syntax`** on the `for…of` loop is intentional: the loop must give back only lines in `taken[]` up to the failure point, which no `Promise.all` wrapper can express.
- **Shortfall read-back** queries this module's own `stockLevelRepository`, not the product's synced copy, to avoid reporting a number that lags by one transition.
- **`holdMinutes` parameter** exists because some payment methods (e.g. `bank_transfer`) need a longer window than the default `reservationTtlMinutes()`.
