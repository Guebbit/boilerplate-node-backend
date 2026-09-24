---
source: src/modules/inventory/service.ts
sha256: 7fc2d0f7dea8e5fc583c2edc819f71a6d9cfb3741b7300af5c8c987f2df1b881
generated_at: 2026-09-23T18:46:19.868085+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/service.ts

## Purpose

The single chokepoint through which every stock counter change in the application passes. It guarantees that a counter move and its corresponding ledger row always happen together (or neither does) without relying on Mongo transactions. All public read and write paths for inventory levels, stock movements, reservations, receipts, and adjustments live here.

## Key elements

- **`conditionFor(reason, quantity)`** — Maps a `StockMovementReason` to the Mongo `QueryFilter` that `applyDelta` must match before the write is accepted. Kept in lock-step (manually) with `counterDeltaFor` in `./domain`.
- **`applyTransition(reason, productId, quantity, context)`** — The internal function every stock mutation goes through: ensures a level row exists, performs a conditional `$inc` write, writes the ledger row, then syncs the product's cached copy. Returns `false` if the guard rejected the write.
- **`reserveForOrder(orderId, lines, holdMinutes?)`** — All-or-nothing hold. Inserts a reservation (unique `orderId` gives exactly-once retry safety), then takes each line via `applyTransition`. On a failed line, rolls back all previously taken lines and returns the specific shortfall.
- **`commitForOrder(orderId)`** — Claims the hold (`held → committed`) for at-most-once semantics, then applies each line's commit. A line refusal is logged, not thrown, because payment has already settled. Distinguishes a benign replay from an alarming "paid but nothing held" case.
- **`StockLine`**, **`StockShortfall`**, **`ReserveOutcome`** — Value types describing hold lines, the reason a line fell short, and the overall reserve result.
- **`LevelFilters`** / **`MovementFilters`** — Input shapes for paginated read queries (stock board and ledger).
- **`SWEEP_BATCH_SIZE`** (200) — Batch size for the reservation-expiry sweep (referenced elsewhere in the file).
- **`levelFor(productId)`** — Reads a product's current counters plus title from the product service, returning `null` if the level row is absent.

## Relationships

| Neighbor                                                                                     | Interaction                                                                                      |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `./domain` (`counterDeltaFor`)                                                               | `applyTransition` calls it to get the `$inc` deltas for a given reason.                          |
| `./config` (`reservationTtlMinutes`, `lowStockThreshold`)                                    | Default TTL for `reserveForOrder`; threshold used in level reads.                                |
| `./repository` (stock-level, stock-movement, reservation)                                    | All Mongo reads/writes for levels, ledger, and reservation documents.                            |
| `./audit` (`inventoryAuditActions`)                                                          | Maps action names for `recordAudit` calls.                                                       |
| `./events` (`RESERVATION_EXPIRED`)                                                           | Emitted (via `emitDomainEvent`) when the sweep expires a hold.                                   |
| `@kernel/events` (`emitDomainEvent`)                                                         | Publishes domain events (e.g. reservation expired).                                              |
| `@kernel/permissions` (`SYSTEM_ACTOR`, `callerForSubject`)                                   | Resolves the actor to record on audit/ledger rows.                                               |
| `@infrastructure/observability/audit` (`recordAudit`)                                        | Writes structured audit entries alongside ledger rows.                                           |
| `@infrastructure/i18n` (`t`)                                                                 | Localises user-facing messages.                                                                  |
| `@infrastructure/http/response`                                                              | Builds `ResponseSuccess` / `ResponseReject` envelopes for controller returns.                    |
| `@infrastructure/adapters/logger` (`logger`)                                                 | Error/warn logging (cache-sync failure, commit refusals, alarms).                                |
| `@infrastructure/persistence/search`                                                         | `normalizePagination`, `buildPaginatedMeta` for paginated list endpoints.                        |
| `@modules/products` (`productService`)                                                       | `findByIdRaw` for titles; `syncStockCache` to keep the catalogue's copy in step.                 |
| `controllers/post-receipt`, `post-adjustment`, `get-inventory-levels`, `get-stock-movements` | Thin HTTP wrappers that call the exported service functions.                                     |
| `modules/cart/tests/integration/stock.test.ts`                                               | Integration tests that exercise `reserveForOrder` / `commitForOrder` / release flows end-to-end. |

## Notes

- **No Mongo transactions.** The invariant (counter + ledger row) is enforced by ordering the writes and the conditional guard; gaps are acknowledged at the call sites that own them.
- **`conditionFor` has no dedicated unit test.** It is a manual invariant kept in sync with `counterDeltaFor` (which _is_ tested in `tests/unit/transitions.test.ts`).
- **"No level row" branch in `applyTransition`:** for `release`/`expire`/`commit`, a missing row returns `true` (trivially moved) so the sweep or order-fulfilment loop can continue past a since-deleted product. `receive` and `adjust` never hit this path in practice.
- **Product cache sync is a plain call, never a domain event.** A failure to sync is logged and swallowed; the next transition self-corrects. (See `docs/modules/inventory.md#why-products-still-carries-a-copy`.)
- **`reserveForOrder` reads the shortfall from this module's own level row**, not the product's synced copy, to avoid a one-transition lag.
- **`commitForOrder` logs rather than throws** on a line refusal: the payment has already moved, so a 500 would misreport the transaction state.
- Stryker mutation-testing suppression (`Stryker disable all / restore all`) wraps the cache-sync catch block to prevent false-positive mutation kills.
