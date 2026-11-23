---
source: src/modules/inventory/services/sweep.ts
source_sha256: 50b2336d52ad7e3106e41baed20d01913e51e9585b2afef01f51f22d32e6d120
context_sha256: fcf0dcb626aa12bd3b0b17626c590044e46be81b5b17d0c415d281595b9c6344
generated_at: 2026-11-22T05:23:45.510515+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/services/sweep.ts

## Purpose
Implements the reservation expiry tick. Every hold whose window has closed is released (its units go back to stock) and a `RESERVATION_EXPIRED` event is announced so the `orders` module can cancel the still-pending order behind it.

## Key elements
- `runReservationSweep(context?)` is the only export. It drains stale holds in batches of `SWEEP_BATCH_SIZE` (200) until a batch comes back short, up to `SWEEP_MAX_BATCHES` (50), so at most 10,000 holds per run. It logs a warning if the cap was hit with a full last batch. It logs an info summary, calls `recordAudit` with the `ADMIN_RESERVATIONS_SWEPT` action and `{ expired }`, and returns the number of holds expired.
- `expireBatch(stale)` runs `tryExpireOne` sequentially over a batch and counts the holds actually released.
- `tryExpireOne(orderId)` wraps `expireOne` and catches any error. It logs the error and returns `false`, so one failing hold doesn't stop the rest of the batch. The failed hold stays due and is retried on the next tick.
- `expireOne(orderId)` calls `announceInTransaction` so that `releaseForOrder(orderId, StockMovementReason.expire, session)` and the `RESERVATION_EXPIRED` outbox event (payload `{ orderId }`, `aggregateId` = orderId) are written in one transaction. If the release returns falsy, nothing is written and it returns `false`. After commit it calls `forgetAvailabilityForOrder(orderId)`.

## Relationships
- `../repository`: the reservation repository supplies the stale holds, read in batches of up to 200.
- `./holds`: provides `releaseForOrder` and `forgetAvailabilityForOrder`. The orders cancel path also calls back into `releaseForOrder`, which finds the hold already released, so the two paths can't double-release.
- `@kernel/outbox`: `announceInTransaction` writes the event row atomically with the release. The relay retries delivery.
- `../events`: supplies the `RESERVATION_EXPIRED` event name.
- `../audit` and `@infrastructure/observability/audit`: the inventory audit actions module supplies the `ADMIN_RESERVATIONS_SWEPT` action, and `recordAudit` produces the audit row.
- `@infrastructure/adapters/logger`: used for error, warn and info logs.
- `@types`: `StockMovementReason` and the `CallerContext` type.
- The scheduled job (see `jobs`) and the admin route call `runReservationSweep`, according to its doc comment. The file doesn't import them.

## Notes
- The audit row is written only when a `context` is passed. The HTTP route passes one, but the scheduled `sweep:reservations` run does not, so the recurring cron sweep writes no audit row.
- The outbox event is written inside the transaction, but the availability cache entry is deleted only after it commits.
- Redelivering the event is safe because the system actor cancels only an order that is still `pending`.
- The batch loop re-reads the expired holds each time and relies on released holds leaving the `held` set, so a repeated read can't see a hold twice.
- The `// Stryker disable` comments only exclude the logging lines from mutation testing.
