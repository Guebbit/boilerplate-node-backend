---
source: src/modules/inventory/services/holds.ts
sha256: fe05afcf6d12605cf3ff0030a81cf74971125b7e4f56982cad60818220f39728
generated_at: 2026-11-08T06:02:17.650173+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/holds.ts

## Purpose

Handles the post-creation lifecycle of an inventory hold: committing it at payment, re-taking units after a release, serving preorder queues when units are freed, and raising alarms for orphaned holds. It is the "what happens next" layer that the delivery and payment modules call into, ensuring every status transition and counter movement is atomic and at-most-once.

## Key elements

- **`RetakeOutcome`** (exported type) — Discriminated union `'none' | 'retaken' | 'short'` describing the result of re-claiming a released hold's units.
- **`retakeReleasedForOrder`** (exported) — Re-claims units from a `released → held` hold inside the caller's (payment) transaction. Sorts lines by `productId` to avoid cross-order deadlocks. On a short line, rolls back partially-taken lines, reverts the hold to `released`, and returns `'short'` (never throws). Enqueues a `STOCK_RETAKEN` outbox event on success.
- **`commitWithin`** (internal) — Core commit body: claims `held → committed`, serves any backorder/preorder allocations via `allocateWithin`, handles the `released → retake → commit` path, and raises an orphan alarm for missing holds.
- **`commitForOrder`** (referenced, likely exported) — Public entry point that wraps `commitWithin` in a transaction and refreshes the stock cache after commit. No counter movement occurs; units remain spoken-for until ship.
- **`claimAndApply`** (internal) — Generic atomic helper: claims a status transition, applies counter movements to every line, and optionally serves the preorder queue. Opens its own transaction and refreshes the cache when no session is supplied.
- **`serveQueueAfter`** (internal) — After a `release` or `expire` movement, re-allocates freed shelf units to waiting preorder buyers within the same transaction. Skips backorder lines (they free allowance, not shelf units).
- **`raiseOrphanAlarm`** (internal) — Logs an error, writes an audit row under `systemCallerContext('Order')`, and increments `inventory_commit_orphaned_total{stage}` for a paid/shipping order with no hold.

## Relationships

- **`src/modules/inventory/repository.ts`** — Calls `reservationRepository.claimStatus` and `findByOrderId` for all conditional status transitions and reads.
- **`src/modules/inventory/services/allocate.ts`** — Calls `allocateWithin` to serve preorder/backorder queues from freed or committed units.
- **`src/modules/inventory/domain/hold-lines.ts`** (via `../domain`) — Imports `takeFromHold` for line-level counter logic.
- **`src/modules/inventory/events.ts`** — Enqueues `HOLD_ORPHANED` and `STOCK_RETAKEN` outbox events.
- **`src/kernel/outbox.ts`** — Uses `enqueueOutboxEvent` for announcements and `nudgeOutbox` after queue-serving commits.
- **`src/kernel/permissions.ts`** — Uses `systemCallerContext` for audit entries on paths with no human caller (settlement webhooks, status moves).
- **`src/infrastructure/runtime/database.ts`** — Wraps standalone operations in `withTransaction`.
- **`src/infrastructure/observability/audit.ts`** — Records orphan-alarm audit rows.
- **`src/infrastructure/adapters/logger.ts`** — Logs orphan alarms and errors.
- **`src/domain-primitives/time.ts`** — Imports `HOUR_MS` (used in the truncated portion, likely for hold-expiry window checks).
- **`src/modules/inventory/services/allocate.ts`** / **`services/index.ts`** — `services/index.ts` re-exports the public API of this module; `allocate.ts` is a sibling service that provides the allocation engine.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Exercises the ship/orphan paths through this module's logic.

## Notes

- **At-most-once via conditional claim.** Every state change starts with a single conditional `claimStatus` write (e.g. `held → committed`). If it misses, the operation is a no-op or an alarm—never a double-apply. The surrounding transaction then guarantees all-or-nothing counter writes.
- **`retakeReleasedForOrder` must not throw on `short`.** The caller (payment) answers `short` by refunding within the *same* transaction. A throw would abort the refund write.
- **Product-id sort order in `retakeReleasedForOrder`.** Lines are sorted by `productId` before applying transitions so two concurrent orders touching the same products in opposite list order cannot deadlock on counter locks.
- **`commitForOrder` moves no counters.** Committing a hold is a status change only; the units stay on the shelf (still spoken-for) until `shipForOrder`. The ledger records one row per counter change, not per status change.
- **`serveQueueAfter` fires only on `release` and `expire`.** A shipment frees nothing because the units are gone; a commit frees nothing because the order is paid and the units are still reserved.
- **Orphan alarm has no human caller.** Audit rows use `systemCallerContext` because the trigger is a payment webhook or a delivery status move—there is no `CallerContext` to propagate.
- **`nudgeOutbox` after queue serving.** When `serveQueueAfter` allocates units to waiting buyers, the caller must call `nudgeOutbox` after the transaction commits so the outbox dispatcher picks up the new events promptly.
