---
source: src/modules/inventory/services/holds.ts
sha256: a7558983f91068a5b383a9cb7965d12d8371428d800f5b2ec908f97b8712d603
generated_at: 2026-10-29T04:03:26.844857+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/holds.ts

## Purpose

Manages the post-creation lifecycle of inventory holds (reservations): committing at payment, shipping at dispatch, releasing/expiring, re-taking a released hold when a late payment lands, and refreshing the catalogue stock cache. Every state transition is an at-most-once conditional claim wrapped in a transaction so a hold is never left claimed-with-counters-unmoved.

## Key elements

- **`retakeReleasedForOrder`** *(exported)* — Re-acquires a released hold's units inside the caller's payment transaction. Lines are applied in sorted product order to avoid cross-order deadlocks; a failed line rolls back the ones already taken, returns the hold to `released`, and reports `'short'`. Enqueues `STOCK_RETAKEN` on success.
- **`commitForOrder`** *(exported, truncated)* — Settles a hold at payment (`held → committed`). No counter movement (units stay spoken-for until ship). A missed claim inspects the existing reservation: `committed`/`shipped` is a benign replay; `released` triggers `retakeReleasedForOrder` then retries; anything else raises the orphan alarm.
- **`shipForOrder`** *(exported, truncated)* — Ships a committed hold (`committed → shipped`), moving shelf counters.
- **`RetakeOutcome`** *(exported type)* — `'none' | 'retaken' | 'short'`, the three ways a re-take can resolve.
- **`serveQueueAfter`** *(internal)* — After a release or expiry frees shelf units, allocates them to waiting backorder/preorder lines in the same transaction. Backorder-`kind` lines are excluded (they free allowance, not shelf units).
- **`claimAndApply`** *(internal)* — Generic helper: claims a status transition then applies counter movements to every line atomically. Opens its own transaction and refreshes the stock cache when no caller session is supplied.
- **`raiseOrphanAlarm`** *(internal)* — Logs, audits (as `systemCallerContext`), and increments the `inventory_commit_orphaned_total` Prometheus counter when a paid/shipping order has no valid hold.
- **`commitWithin`** *(internal)* — Body of `commitForOrder`; delegates the re-take + orphan logic.

## Relationships

- **`../repository`** (`reservationRepository`) — All status claims and lookups go through this repository; the conditional `claimStatus` write is the at-most-once guard.
- **`./allocate`** (`allocateWithin`) — Called from `serveQueueAfter` and `commitWithin` to serve preorders from freed or newly-committed stock.
- **`../domain`** (`takeFromHold`) — Domain-level hold-line mutation used in counter application.
- **`./transition`** (`applyToEveryLine`, `applyTransition`, `refreshStockCacheForProducts`) — Low-level counter writes and post-commit cache invalidation.
- **`../events`** — Provides `HOLD_ORPHANED` and `STOCK_RETAKEN` event descriptors for outbox enqueueing.
- **`../audit`** (`inventoryAuditActions`) — Supplies the action constant for the orphan audit record.
- **`./orphan-counter`** (`inventoryCommitOrphanedTotal`) — Prometheus counter incremented in `raiseOrphanAlarm`; backs the `PaidOrderWithoutHold` dashboard page.
- **`@kernel/outbox`** — `enqueueOutboxEvent` publishes domain events; `nudgeOutbox` wakes the outbox processor after a transaction that served queue lines.
- **`@kernel/permissions`** — `systemCallerContext` fabricates the caller for audit entries where no human is present (webhook settlement, status automation).
- **`@infrastructure/runtime/database`** — `withTransaction` wraps the claim-and-move unit when no caller session is provided.
- **`@infrastructure/adapters/logger`** — Error-level logging in `raiseOrphanAlarm`.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the structured audit row for orphan alarms.
- **`services/index.ts`** — Re-exports this module's public API to other inventory services.
- **`delivery/tests/unit/fulfillment.test.ts`** — Exercises the ship path end-to-end.

## Notes

- **At-most-once + all-or-nothing:** the conditional `claimStatus` write prevents double-apply; the surrounding transaction prevents partial counter movement. A thrown line undoes the claim so a retry starts clean.
- **`retakeReleasedForOrder` never throws.** It returns `'short'` so the caller can issue a refund *inside the same transaction*. Throwing would abort that transaction and lose the refund record.
- **Sorted line application:** lines are applied in `productId` locale order to avoid two orders listing the same products in opposite order deadlocking on product-level counter writes.
- **Only release and expiry free shelf units.** Commit and ship do not free units; `serveQueueAfter` is a no-op for those reasons.
- **No ledger row on commit.** The ledger records one row per counter change; commit moves no counters, so no ledger entry is written. The `committedAt` timestamp doubles as the preorder queue sort key.
- **Stryker suppression:** the `logger.error` call in `raiseOrphanAlarm` is wrapped in `// Stryker disable all` / `restore all` to prevent mutation testing from mutating the log message.
