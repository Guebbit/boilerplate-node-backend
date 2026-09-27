---
source: src/modules/inventory/service.ts
sha256: cc7ac8d2d4fe968f6c486f2c4df4328f1fea7ba11573afb9aea90b43bd14e2af
generated_at: 2026-09-27T14:56:40.559567+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/service.ts

## Purpose

The single service through which every stock counter change in the application flows. It owns the reserve/release/commit/receive/adjust transitions, the reservation hold lifecycle, and the read paths for inventory levels and stock-movement history. All mutations funnel through one private chokepoint (`applyTransition`) so that a counter never moves without a matching ledger row and vice-versa.

## Key elements

- **`StockLine`** (exported interface) — a `{ productId, quantity }` pair representing one line to hold or release.
- **`StockShortfall`** (exported interface) — describes a line a reserve could not cover, with `requested` vs `available` quantities.
- **`ReserveOutcome`** (exported union type) — `{ held: true; expiresAt }` or `{ held: false; shortfalls: StockShortfall[] }`; the sole return shape of `reserveForOrder`.
- **`LevelFilters`** / **`MovementFilters`** (exported interfaces) — query-parameter shapes accepted by the level and movement read endpoints.
- **`SWEEP_BATCH_SIZE`** (const, 200) — max holds expired per sweep run before the caller re-queues.
- **`applyTransition`** (private) — the chokepoint. Ensures a level row exists, applies a conditional delta, writes the ledger row, then syncs the catalogue's stock cache. Returns `true` only when counters actually moved.
- **`levelFor`** (private) — reads back a product's counters plus its title after a write.
- **`giveBackAndDeleteHold`** (private) — rollback helper: narrows the hold to only the lines actually taken, releases each via `applyTransition`, then deletes the hold. Each step logs rather than throws so one failure doesn't mask the rest.
- **`reserveForOrder`** (exported) — holds every line for an order or none. Uses a unique `orderId` hold for exactly-once semantics; iterates lines with conditional writes; on refusal or throw, rolls back through `giveBackAndDeleteHold` and returns shortfalls or rethrows.
- *(truncated)* — the file continues with additional exports (level reads, movement reads, adjustment, sweep logic) that the controllers and sweep script consume.

## Relationships

- **`src/modules/inventory/config.ts`** — provides `reservationTtlMinutes` (default hold window) and `lowStockThreshold` (drives `lowOnly` filtering).
- **`src/modules/inventory/audit.ts`** — supplies `inventoryAuditActions` used with `recordAudit` to tag ledger/transition events.
- **`src/modules/inventory/controllers/get-inventory-levels.ts`** — calls the level-read path (accepts `LevelFilters`).
- **`src/modules/inventory/controllers/get-stock-movements.ts`** — calls the movement-read path (accepts `MovementFilters`).
- **`src/modules/inventory/controllers/post-adjustment.ts`** — calls the adjust path, which ultimately goes through `applyTransition`.
- **`scripts/ops/sweep-reservations.ts`** — drives the expiration sweep that releases holds past `expiresAt` and deletes them, using `SWEEP_BATCH_SIZE`.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` is called at transition points to persist an audit trail.
- **`src/infrastructure/persistence/search.ts`** — `normalizePagination` / `buildPaginatedMeta` power the paginated level and movement queries.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape the HTTP responses returned by the controllers.
- **`src/infrastructure/i18n/index.ts`** — `t` is used for localised messages (e.g. refusal reasons).
- **`src/kernel/events.ts`** — `emitDomainEvent` fires `RESERVATION_EXPIRED` (and likely other domain events) from the sweep/commit paths.
- **`src/kernel/permissions.ts`** — `SYSTEM_ACTOR` and `callerForSubject` identify the acting principal on audit rows.
- **`src/infrastructure/adapters/logger.ts`** — structured error logging on every non-fatal failure (cache sync, rollback steps, sweep errors).
- **`src/modules/cart/tests/integration/stock.test.ts`** — integration tests that exercise `reserveForOrder`, release, and commit flows end-to-end.

## Notes

- **No Mongo transactions.** Atomicity is achieved through conditional writes (atomic `$inc` with a guard), the unique `orderId` hold for idempotency, and careful rollback ordering. Gaps are acknowledged at call sites that own them.
- **The catalogue stock-cache sync is a plain call, never a domain event.** If it fails, the transition has already committed; the next transition on that product corrects the cache.
- **Rollback writes to the ledger.** A failed reserve records both the `reserve` and the `release` rows — they are not netted to zero — so the movement history is a faithful event log.
- **`release`/`expire`/`commit` on a missing level row return `true` (trivially moved),** not an error, because the product's level row is deleted with the product. This lets a multi-line order's sweep continue past already-deleted lines.
- **The hold is narrowed to `taken` before any counter moves during rollback**, preventing a crash from leaving a hold that names lines whose counters were never touched.
