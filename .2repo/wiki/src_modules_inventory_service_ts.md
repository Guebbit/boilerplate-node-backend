# src/modules/inventory/service.ts

## Purpose

The single application-level chokepoint for every stock counter change. It implements the reserve → commit / release lifecycle for order holds, guarantees that a counter move and its ledger row are inseparable (via `applyTransition`), and provides the externally-driven expiry sweep. No Mongo transactions are used; atomicity comes from conditional writes in mongod plus the reservation's unique `orderId` for idempotency.

## Key elements

- **`applyTransition`** (private) — The one function all stock changes pass through. Performs the conditional counter write first; if it refuses, no ledger row is written. If it succeeds, a `StockMovementDocument` is created via `stockMovementRepository`.
- **`reserveForOrder`** (exported) — Holds stock for every line in an order, all-or-nothing. Inserts a unique hold record for idempotency, then takes lines one at a time. On failure, rolls back already-taken lines through `applyTransition(release)` and reports a `StockShortfall` with live availability.
- **`commitForOrder`** (exported) — Claims `held → committed` (at-most-once), then commits each line's counters. A counter refusal is logged, not thrown, because payment has already moved.
- **`releaseForOrder`** (exported) — Claims `held → released`, then releases each line. Accepts only `'release' | 'expire'` to prevent a caller from accidentally recording a sale.
- **`runReservationSweep`** (exported) — Exports up to `SWEEP_BATCH_SIZE` (200) stale holds, releases each via `releaseForOrder(expire)`, and emits `RESERVATION_EXPIRED` so the orders module can cancel. Externally triggered; the app ships no scheduler.
- **`ReserveOutcome`** (exported type) — Discriminated union: `{ held: true }` or `{ held: false; shortfalls: StockShortfall[] }`.
- **`StockLine` / `StockShortfall`** (exported interfaces) — Line-level request and shortfall shapes.
- **`LevelFilters` / `MovementFilters`** (exported interfaces) — Query-filter types consumed by the inventory controllers.
- **`writerFor`** (private) — Maps a `StockMovementReason` to the correct `productRepository` conditional-write method. Kept in sync with `counterDeltaFor`'s deltas table; asserted by `tests/unit/transitions.test.ts`.
- **`levelFor`** (private) — Reads a product's raw counters and computes `available` via `availabilityOf`.
- **`isStockBoundToOrder`** (private) — Checks whether a hold is in `held` or `committed` status (i.e. stock is still bound to the order's lines).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/cart/services/checkout.ts` | Consumer of `reserveForOrder` / `commitForOrder` during the checkout flow. |
| `src/modules/cart/tests/integration/stock.test.ts` | Integration-test consumer exercising the reserve/commit/release path. |
| `src/modules/inventory/controllers/get-inventory-levels.ts` | Consumes `LevelFilters` (and likely `levelFor` / pagination helpers) to serve stock-board reads. |
| `src/modules/inventory/controllers/get-stock-movements.ts` | Consumes `MovementFilters` to serve paginated ledger reads. |
| `src/modules/inventory/config.ts` | Provides `reservationTtlMinutes` (hold TTL) and `lowStockThreshold`. |
| `src/modules/inventory/audit.ts` | Provides `inventoryAuditActions` used by the sweep's audit emit. |
| `src/kernel/events.ts` | `emitDomainEvent` is called for `RESERVATION_EXPIRED` in the sweep. |
| `src/infrastructure/observability/audit.ts` | `emitAuditEvent` / `buildAuditEvent` used for `ADMIN_RESERVATIONS_SWEPT` audit trail. |
| `src/infrastructure/persistence/search.ts` | `normalizePagination`, `buildPaginatedMeta`, `PaginationInput` for paginated reads. |
| `src/infrastructure/persistence/create-repository.ts` | `SearchFilters` type extends into `MovementFilters`. |
| `src/infrastructure/http/request.ts` | `CallerContext` type parameterises `runReservationSweep`'s audit context. |
| `src/infrastructure/http/response.ts` | `generateSuccess` / `generateReject` / response types imported (used by controller layer). |
| `src/infrastructure/i18n/index.ts` | `t` helper for localised strings. |
| `src/infrastructure/adapters/logger.ts` | `logger.error` for counter-refusal incidents in commit/release. |

## Notes

- **No transactions.** Atomicity relies on mongod's conditional write (compare-and-swap) for the counter and the unique `orderId` insert for the hold. Gaps (e.g. the window between counter success and ledger-row write) are acknowledged at call sites rather than closed by a 2PC.
- **Rollback is a real ledger entry.** When `reserveForOrder` unwinds, it calls `applyTransition(release)`, so the ledger records both the take *and* the give-back. The system deliberately does not net them to zero.
- **`releaseForOrder`'s parameter is intentionally narrow.** It accepts the two-literal union `'release' | 'expire'` instead of the full `StockMovementReason` enum, so a caller cannot accidentally pass `'commit'` and record a phantom sale.
- **The sweep is idempotent by construction.** `releaseForOrder` claims `held → released` atomically; if the orders module's own cancel path calls back in, it finds the hold already released and does nothing.
- **`SWEEP_BATCH_SIZE = 200`.** A full batch implies more work remains; the caller is expected to re-schedule (the app ships no internal timer).
- **`writerFor` and `counterDeltaFor` must stay in sync.** A unit test (`tests/unit/transitions.test.ts`) asserts the mapping; adding a new `StockMovementReason` requires updating both tables.
