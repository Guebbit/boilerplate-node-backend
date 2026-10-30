---
source: src/modules/inventory/services/sweep.ts
sha256: 53a71806284af530c70b240e32050f95fb9b760f79df0b7066bdb28127baee2c
generated_at: 2026-10-29T04:04:49.852243+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/sweep.ts

## Purpose

Implements the reservation-expiry tick: finds holds whose time window has closed, releases their stock units, and announces a `RESERVATION_EXPIRED` event so the `orders` module can cancel the corresponding order. Runs in bounded batches so a pathological backlog cannot outlive the job's lease. The file exports a single entry point (`runReservationSweep`) meant to be called by an external scheduler or an operator's on-demand HTTP route.

## Key elements

- **`SWEEP_BATCH_SIZE` (200)** — holds read and expired per batch.
- **`SWEEP_MAX_BATCHES` (50)** — upper bound on batches per run (max 10 000 holds); prevents a single tick from outliving its lease.
- **`expireOne(orderId)`** — releases one stale hold and writes the `RESERVATION_EXPIRED` outbox event in a single transaction via `announceInTransaction`; refreshes the stock cache only after commit. Returns `true` if this call was the one that released it.
- **`tryExpireOne(orderId)`** — wraps `expireOne` with error catching so a single failed hold does not abort the rest of the batch.
- **`expireBatch(stale)`** — iterates a batch of stale holds, calls `tryExpireOne` for each, returns the count actually released.
- **`runReservationSweep(context?)`** *(exported)* — the public entry point. Loops batches until one comes back short or the max is hit, logs a warning if truncated, records an audit row, and returns the total expired count.

## Relationships

- **`src/modules/inventory/services/holds.ts`** — calls `releaseForOrder` (actual stock release) and `refreshStockCacheForOrder` (post-commit cache update).
- **`src/modules/inventory/repository.ts`** — calls `reservationRepository.findExpired(now, limit)` to fetch due holds.
- **`src/kernel/outbox.ts`** — uses `announceInTransaction` to make the release + event write atomic.
- **`src/modules/inventory/events.ts`** — imports `RESERVATION_EXPIRED` event name for the outbox payload.
- **`src/modules/inventory/audit.ts`** — imports `inventoryAuditActions` enum for the audit row.
- **`src/infrastructure/observability/audit.ts`** — calls `recordAudit` once at the end of the sweep.
- **`src/infrastructure/adapters/logger.ts`** — emits error, warn, and info log lines.
- **`src/types/index.ts`** — imports `StockMovementReason` and `CallerContext`.
- **`src/modules/inventory/services/index.ts`** — re-exports `runReservationSweep` as part of the inventory service surface.
- **`src/modules/inventory/jobs.ts`** — the scheduled caller; this file has no scheduler of its own and is driven externally (see doc comment referencing `sweep:reservations`).

## Notes

- **Idempotent release:** If the `orders` module cancels first and calls back into `releaseForOrder`, the second call finds the hold already released and is a no-op. Conversely, a redelivered `RESERVATION_EXPIRED` event only cancels an order still in `pending` state.
- **Audit is conditional:** `runReservationSweep` accepts an optional `CallerContext`. The recurring cron path passes `undefined`, so no audit row is written; only an operator's on-demand HTTP call (which always supplies a context) produces an `ADMIN_RESERVATIONS_SWEPT` audit entry.
- **Cache update is post-commit:** `refreshStockCacheForOrder` is deliberately called *after* the transaction commits, not inside it, to avoid reading uncommitted state.
- **No built-in scheduler:** The module does not schedule itself; callers must invoke `runReservationSweep` on their own cadence (documented as ~5-minute ticks).
- **Stryker mutations:** Several log/audit lines are wrapped in `// Stryker disable` comments to prevent mutation testing from altering operational log messages.
