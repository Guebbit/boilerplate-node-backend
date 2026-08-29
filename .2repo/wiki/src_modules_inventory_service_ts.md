# src/modules/inventory/service.ts

## Purpose

The single module responsible for every stock mutation in the application. Enforces one invariant through a shared chokepoint (`applyTransition`): a product's counters never move without a corresponding ledger row, and a ledger row is never written for a counter that did not move. All public operations (reserve, commit, release, expire, sweep) funnel through this path.

## Key elements

- **`applyTransition(reason, productId, quantity, context)`** *(private)* — The chokepoint. Performs the conditional write via `writerFor`, and only on success writes a `stockMovementRepository.create` row. Returns `boolean` (moved or not). Every stock change in the codebase goes through this function.
- **`writerFor(reason)`** *(private)* — Table mapping each `StockMovementReason` to the matching `productRepository` conditional-write method. Must stay in sync with `counterDeltaFor`; asserted by `tests/unit/transitions.test.ts`.
- **`reserveForOrder(orderId, lines)`** — Holds every line for an order or none. Inserts a unique `orderId` hold first (exactly-once), then takes lines one-by-one. On shortfall: reads the blocking product back, rolls back all taken lines via `applyTransition(release)`, deletes the hold, and returns the specific `StockShortfall[]`.
- **`commitForOrder(orderId)`** — Claims `held → committed` (at-most-once) then moves counters for each line. A counter refusal is **logged**, not thrown, because payment has already settled.
- **`releaseForOrder(orderId, reason: 'release' | 'expire')`** — Claims `held → released` then returns units. The parameter is intentionally narrowed to two literals to prevent a caller from accidentally passing `commit`.
- **Sweep / expiry logic** (truncated in listing) — Releases all expired holds in batches of `SWEEP_BATCH_SIZE` (200), emits a `RESERVATION_EXPIRED` domain event so the `orders` module can cancel the underlying order. Driven externally; the app ships no scheduler.
- **`StockLine`, `StockShortfall`, `ReserveOutcome`** — Public shapes for callers to pass in and read out.
- **`LevelFilters`, `MovementFilters`** — Query-filter interfaces consumed by the read controllers (`get-inventory-levels`, `get-stock-movements`), extending the shared `PaginationInput` / `SearchFilters`.
- **`isStockBoundToOrder(orderId)`** *(private)* — Checks whether a hold is still `held` or `committed`; used by callers that need to know if stock is locked to an order's frozen basket.

## Relationships

- **`productRepository`** (`@modules/products`) — All conditional counter writes (`reserveUnits`, `commitUnits`, `releaseUnits`, `receiveUnits`, `adjustUnits`) and raw reads (`findByIdRaw`) are delegated here.
- **`stockMovementRepository` / `reservationRepository`** (`./repository`) — Ledger-row inserts and hold lifecycle (insert, claim status, delete, find).
- **`./domain`** — `counterDeltaFor` (reason → signed deltas for the ledger row) and `availabilityOf` (derives `available` from `onHand`/`reserved`).
- **`./config`** — `reservationTtlMinutes` (hold expiry window) and `lowStockThreshold` (used by the levels controller).
- **`./audit`** (`inventoryAuditActions`) + **`@infrastructure/observability/audit`** (`emitAuditEvent`, `buildAuditEvent`) — Audit-trail emission for state transitions.
- **`@kernel/events`** (`emitDomainEvent`) — Publishes `RESERVATION_EXPIRED` (and potentially other domain events) to the event bus.
- **`@infrastructure/persistence/search`** — `normalizePagination`, `buildPaginatedMeta` for paginated read endpoints.
- **`@infrastructure/persistence/base-repository`** — `SearchFilters` type base for `MovementFilters`.
- **`@infrastructure/http/request`** — `CallerContext` type for audit attribution.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` helpers for controller-level response shaping.
- **`@infrastructure/i18n`** — `t` for user-facing strings (shortfall messages, audit labels).
- **`@infrastructure/adapters/logger`** — `logger.error` for non-fatal counter-refusal logging in `commitForOrder` / `releaseForOrder`.
- **`src/modules/cart/services/checkout.ts`** — Primary caller of `reserveForOrder` (checkout) and `commitForOrder` (post-payment).
- **`src/modules/cart/tests/integration/stock.test.ts`** — Integration tests exercising reserve/commit/release flows through the cart.
- **`src/modules/inventory/controllers/get-inventory-levels.ts`** — Consumes `LevelFilters` and the level-read helpers.
- **`src/modules/inventory/controllers/get-stock-movements.ts`** — Consumes `MovementFilters` and the ledger-read helpers.

## Notes

- **No Mongo transactions.** Atomicity relies entirely on conditional (compare-and-swap) writes in mongod. Two documented crash windows exist: (1) a crash mid-reserve strands held lines until the sweep recovers them; (2) a crash between `claimStatus` and the counter move strands units (deliberately chosen over the alternative, which would let two callers both move counters).
- **Rollback is visible in the ledger.** In `reserveForOrder`, the give-back is recorded as a separate `release` row (with a note), not netted against the original `reserve` row. The ledger is an audit trail, not a diff.
- **`writerFor` ↔ `counterDeltaFor` invariant.** These two tables must agree on which reasons produce which signed deltas. A unit test (`tests/unit/transitions.test.ts`) enforces this; adding a new `StockMovementReason` requires updating both.
- **`releaseForOrder` parameter is intentionally narrow** (`'release' | 'expire'`, not the full enum). This is a compile-time guard against passing `'commit'` to a function that would record a sale.
- **The hold document's unique `orderId` is the idempotency key** for `reserveForOrder`. Retried checkouts lose the insert and return `{ held: true }` without touching counters.
- **Sweep is externally driven.** The module exposes the sweep function but ships no timer/cron. The orchestrator (or a job runner) calls it periodically, same pattern as the `delivery` courier.
