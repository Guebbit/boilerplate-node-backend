---
source: src/modules/inventory/services/holds.ts
sha256: 0c2421a4fd18d70fce95ed46619cdba70e5dff844aad63342ff2f7c9074c7f37
generated_at: 2026-11-14T20:06:35.730706+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/holds.ts

## Purpose

Manages the post-creation lifecycle of inventory holds (reservations): committing at payment, shipping, releasing, extending, and retaking released units. It ensures every status transition is a single atomic claim-plus-counter-movement, and that the paid-buyer queue is served first whenever shelf units become free.

## Key elements

- **`retakeReleasedForOrder`** (exported) — Re-claims a `released` hold's units inside the payment's transaction. Returns `RetakeOutcome` (`'none' | 'retaken' | 'short'`). On `short`, rolls back partial lines and restores `released` status; never throws.
- **`commitForOrder`** (exported, truncated) — Settles `held → committed` at payment. No counter movement (units stay reserved). Serves any backorder/preorder lines via `allocateWithin`. On a missed claim, distinguishes benign replay from a true orphan and raises the orphan alarm.
- **`shipForOrder`** (exported, truncated) — Dispatch transition; the counter-movement that actually frees shelf units.
- **`serveQueueAfter`** (internal) — After a `release` or `expire`, calls `allocateWithin` so waiting paid buyers grab the freed shelf units in the same transaction. Skips backorder lines.
- **`claimAndApply`** (internal) — Generic helper: conditional status claim + per-line counter movement + optional queue service, wrapped in `withTransaction` when no caller session is supplied.
- **`raiseOrphanAlarm`** (internal) — Logs, audits as system caller, increments `inventoryCommitOrphanedTotal`, and enqueues `HOLD_ORPHANED`. Used when a paid/shipping order has no active hold.
- **`RetakeOutcome`** (exported type) — Union discriminant for the retake result.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/inventory/repository.ts` | Every hold state transition is a conditional write through this module's repository (claim, find-by-order). |
| `src/modules/inventory/services/allocate.ts` | `allocateWithin` serves the paid-buyer queue within the same transaction after a release/expire or at commit. |
| `src/modules/inventory/domain/index.ts` | Provides `takeFromHold` for domain-level hold arithmetic during transitions. |
| `src/modules/inventory/domain/hold-lines.ts` | Part of the domain barrel consumed above; defines the line-level structures this module iterates over. |
| `src/modules/inventory/model.ts` | `ReservationStatus` type and `OPEN_RESERVATION_STATUSES` constant for status validation. |
| `src/modules/inventory/events.ts` | `HOLD_ORPHANED` and `STOCK_RETAKEN` — outbox event names enqueued by this module. |
| `src/modules/inventory/audit.ts` | Supplies the audit-action identifiers (e.g. `ADMIN_COMMIT_ORPHANED`) used in `recordAudit` calls. |
| `src/kernel/outbox.ts` | `enqueueOutboxEvent` and `nudgeOutbox` to publish and flush domain announcements. |
| `src/kernel/permissions.ts` | `systemCallerContext` fabricates a caller identity for audit rows on system-driven paths. |
| `src/infrastructure/observability/audit.ts` | `recordAudit` persists audit entries for orphan alarms. |
| `src/infrastructure/runtime/database.ts` | `withTransaction` opens a Mongoose session when the caller does not supply one. |
| `src/infrastructure/adapters/logger.ts` | Error-level logging on the orphan-alarm path. |
| `src/domain-primitives/time.ts` | `HOUR_MS` constant used in hold-expiry / extension calculations. |
| `src/modules/inventory/services/index.ts` | Barrel that re-exports this module's public API (`retakeReleasedForOrder`, `commitForOrder`, etc.). |
| `src/modules/delivery/tests/unit/fulfillment.test.ts` | Unit tests that exercise the hold-commit and ship paths through this module. |

## Notes

- **Deadlock-safe ordering:** `retakeReleasedForOrder` sorts lines by `productId` (locale `en`) before writing so two orders listing the same products in opposite order cannot deadlock on conditional counter updates.
- **`short` is a value, not an error:** `retakeReleasedForOrder` returns `'short'` rather than throwing, because the caller must still execute a refund within the *same* transaction; a throw would abort the refund.
- **`serveQueueAfter` is intentionally narrow:** it only fires on `StockMovementReason.release` and `StockMovementReason.expire`. A shipment frees nothing; a payment frees nothing.
- **Backorder lines are excluded from queue service:** they consume preorder *allowance*, not shelf units, so releasing them does not make physical stock available to the FIFO queue.
- **Orphan alarm is always audited as system:** there is no human `CallerContext` on the settlement or status-move paths; `systemCallerContext('Order')` is used so the audit trail is never silently skipped.
- **Stryker annotations** wrap the `logger.error` call to suppress mutation testing on the formatted message string.
- **`claimAndApply` without a session** opens its own transaction and calls `refreshStockCacheForOrder` post-commit; callers that pass a session must handle their own cache refresh.
