---
source: src/modules/inventory/services/sweep.ts
sha256: 53a71806284af530c70b240e32050f95fb9b760f79df0b7066bdb28127baee2c
generated_at: 2026-11-08T06:03:40.452896+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/sweep.ts

## Purpose

Implements the reservation-expiry tick: it finds all holds whose time window has closed, releases their units back to inventory, and publishes a `RESERVATION_EXPIRED` event so the `orders` module can cancel the underlying order. It runs in bounded batches so a pathological backlog terminates within the job's lease window, with the next external tick picking up where it left off.

## Key elements

- **`SWEEP_BATCH_SIZE` (200) / `SWEEP_MAX_BATCHES` (50)** — cap a single run at 10 000 holds; if the last batch is still full the run logs a warning and defers the remainder.
- **`expireOne(orderId)`** — single-transaction release + outbox event write via `announceInTransaction`. After commit, refreshes the stock cache for that order. Returns `false` if the hold was already gone.
- **`tryExpireOne(orderId)`** — wraps `expireOne` in a `.catch` so one failed hold (rolled back, still due) does not abort the rest of the batch.
- **`expireBatch(stale)`** — iterates a batch of stale holds, calls `tryExpireOne` sequentially, returns the count actually released.
- **`runReservationSweep(context?)`** *(exported)* — the drain loop: reads expired holds up to `SWEEP_MAX_BATCHES × SWEEP_BATCH_SIZE`, expires them, logs a summary, records an audit row (if `context` is present), and returns the total expired count.

## Relationships

- **`../repository`** — calls `reservationRepository.findExpired(now, batchSize)` to fetch due holds each iteration.
- **`./holds`** — calls `releaseForOrder` (atomic release of units) and `refreshStockCacheForOrder` (cache invalidation outside the transaction).
- **`@kernel/outbox`** — uses `announceInTransaction` so the release and the `RESERVATION_EXPIRED` outbox row commit or roll back together.
- **`../events`** — references `RESERVATION_EXPIRED` as the event name in the outbox payload.
- **`../audit`** — references `inventoryAuditActions.ADMIN_RESERVATIONS_SWEPT` for the audit action string.
- **`@infrastructure/observability/audit`** — calls `recordAudit` at the end of the sweep.
- **`@infrastructure/adapters/logger`** — logs per-hold errors, the truncation warning, and the final summary.
- **`@types` / `@types/auth-context`** — imports `StockMovementReason.expire` and the `CallerContext` type.

## Notes

- **No in-app scheduler.** The sweep is driven externally (a cron job or an operator HTTP route). The app does not ship a timer for this, same pattern as the delivery carrier.
- **Audit is conditional.** `runReservationSweep` accepts an optional `CallerContext`. The recurring cron invocation passes nothing, so no audit row is written; only an operator's on-demand call produces one.
- **Stock-cache refresh is post-commit.** `refreshStockCacheForOrder` is called *after* `announceInTransaction` resolves, deliberately outside the database transaction.
- **Idempotent by design.** If `orders` cancels the order first, its cancel path calls `releaseForOrder` and finds the hold already gone (returns `false`), so neither path double-releases.
- **Stryker mutation-testing markers** (`Stryker disable/restore all`) wrap the logger and audit calls so mutation testing does not flag them.
