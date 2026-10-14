---
source: src/modules/inventory/services/sweep.ts
sha256: 72707e4e7ce8d02af86e587b90aa040c5e07547cb41efe837c2bc11020b956b3
generated_at: 2026-10-14T15:59:40.522585+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/sweep.ts

## Purpose

Implements the reservation expiry tick: it finds holds whose window has closed, releases their stock units back into the available pool, and announces a `RESERVATION_EXPIRED` event so the orders module can cancel the now-fulfillable order. It exists to prevent stock from being locked indefinitely by stale reservations that the ordering side never cancels.

## Key elements

- **`SWEEP_BATCH_SIZE` (200)** / **`SWEEP_MAX_BATCHES` (50)** — per-run bounds: at most 10 000 holds are drained before the tick yields, so a pathological backlog cannot outlive the job's lease.
- **`expireOne(orderId)`** — releases one stale hold and writes the `RESERVATION_EXPIRED` outbox row in a single transaction via `announceInTransaction`; after commit, calls `refreshStockCacheForOrder`.
- **`tryExpireOne(orderId)`** — wraps `expireOne` in a `.catch` that logs and returns `false`, so one failed hold does not abort the rest of the batch.
- **`expireBatch(stale)`** — sequentially iterates a batch of stale holds, calling `tryExpireOne`, and returns the count actually released.
- **`runReservationSweep(context?)`** *(exported)* — drains expired holds in successive batches (stopping on a short batch or after `SWEEP_MAX_BATCHES`), logs a summary, records an audit row, and returns the total expired count.

## Relationships

- **`@kernel/outbox`** — `announceInTransaction` guarantees the stock release and the event row commit atomically; the outbox relay retries delivery to `orders`.
- **`../repository`** — `reservationRepository.findExpired(now, limit)` supplies each batch of stale holds.
- **`./holds`** — `releaseForOrder` performs the actual counter decrement; `refreshStockCacheForOrder` invalidates the catalogue cache post-commit.
- **`../events`** — provides the `RESERVATION_EXPIRED` event name written to the outbox.
- **`../audit`** — supplies the `ADMIN_RESERVATIONS_SWEPT` action constant for the audit record.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the audit row at the end of the sweep.
- **`@infrastructure/adapters/logger`** — structured logging for per-hold errors, truncation warnings, and the summary info line.
- **`@types`** — `StockMovementReason.expire` (passed to `releaseForOrder`) and `CallerContext` (optional audit context parameter).
- **`./index`** — re-exports `runReservationSweep` for consumers.
- **Test files** (`cache-invalidation`, `preorder`, `service` integration tests) — exercise sweep behavior end-to-end.

## Notes

- **No built-in scheduler.** The function is driven externally: either an HTTP route or the standalone script `scripts/ops/sweep-reservations.ts`.
- **Audit is conditional.** The `context` parameter is optional; the cron/scheduled path passes `undefined`, so `recordAudit` writes no row. Only an operator's on-demand call produces an audit entry.
- **Cache refresh is post-commit.** `refreshStockCacheForOrder` is called *after* `announceInTransaction` resolves, deliberately outside the DB transaction.
- **Idempotent with orders-cancel.** If `orders` has already cancelled (calling `releaseForOrder` itself), `expireOne` gets a falsy result from the repository and skips the announcement — no double-release.
- **Sequential, not parallel.** `expireBatch` awaits each `tryExpireOne` in a `for…of` loop; holds are processed one at a time.
- **Truncation is explicit.** If the final allowed batch is full, a `logger.warn` is emitted so a truncated run is distinguishable from a clean one in logs.
