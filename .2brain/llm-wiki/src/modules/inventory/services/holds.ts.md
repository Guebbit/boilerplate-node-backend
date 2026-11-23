---
source: src/modules/inventory/services/holds.ts
source_sha256: aacec3e3a0deaab99c81df24b3fa19d9d100a846b379f39bee0aff76ebe87624
context_sha256: ad1f5c8a3d5b3b7a0f8ba4fff7cd670a826538b28d1e1db659c732ed0fc2a9b6
generated_at: 2026-11-22T05:22:14.498576+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/services/holds.ts

## Purpose
Handles what happens to an order's stock hold after it is taken: commit at payment, ship, release, extend, and the availability-cache refresh. Each state change claims the hold with a conditional status write and moves per-line counters in the same transaction, so the move is both at-most-once and all-or-nothing.

## Key elements
- `serveQueueAfter` (internal): after a `release` or `expire` movement, calls `allocateWithin` for the freed non-backorder products so paid buyers waiting for stock are served first. It returns the number of orders served, and the caller must `nudgeOutbox` after its commit. Other movement reasons, and backorder lines, free no shelf units, so it returns 0.
- `claimAndApply` (internal): claims a hold (`from → to`) with a conditional status write, then applies the movement to every line and serves the queue. If no session is passed, it opens its own with `withTransaction`. It then nudges the outbox if orders were served and calls `forgetAvailabilityForOrder`. It returns whether this call made the claim.
- `raiseOrphanAlarm` (internal): called when an order is paid or shipping but its hold is missing or already given up. It logs an error, records a system-caller audit entry (`ADMIN_COMMIT_ORPHANED`, outcome `failure`), and increments `inventoryCommitOrphanedTotal{stage}` (`commit` or `ship`).
- `RetakeOutcome` (exported type): `'none' | 'retaken' | 'short'`.
- `retakeReleasedForOrder(orderId, session)` (exported): in the payment's transaction, claims `released → held` and takes each line's units again.
  - Lines are processed in product-id order, to avoid mutual refusals between orders.
  - If a line refuses, it undoes the lines already taken, puts the hold back to `released` and returns `short`. It never throws.
  - On success it enqueues a `STOCK_RETAKEN` outbox event.
- `commitWithin` (internal): the body of `commitForOrder`, run in the caller's transaction.
  - It claims `held → committed` and allocates any preorder (`backorder`) lines.
  - If the claim misses, it reads the reservation. `committed` or `shipped` is treated as a benign replay.
  - If the hold was `released`, it tries a retake and then recurses to commit, returning `retook: true`.
  - Otherwise it raises the orphan alarm, enqueues `HOLD_ORPHANED` and returns `orphaned: true`.
- `commitForOrder`, `shipForOrder`, `forgetAvailabilityForOrder` are referenced in the visible code and docs. Their definitions are not shown in the visible portion.

## Relationships
- **`../repository`**: the reservation repository supplies the conditional status claim and the lookup by order id.
- **`./transition`**: `applyToEveryLine` and `applyTransition` write the per-line counter movements.
- **`./allocate`**: `allocateWithin` serves waiting or preorder orders from freed or arrived stock.
- **`./availability`**: `forgetAvailability` clears cached availability entries after commit.
- **`@infrastructure/runtime/database`**: `withTransaction` opens the transaction when the caller supplies none.
- **`@kernel/outbox`**: `enqueueOutboxEvent` (`STOCK_RETAKEN`, `HOLD_ORPHANED`, from `../events`) and `nudgeOutbox`.
- **`@infrastructure/observability/audit`, `@kernel/permissions`, `../audit`**: `recordAudit`, `systemCallerContext('Order')` and `inventoryAuditActions` produce the system-attributed audit row.
- **`@infrastructure/adapters/logger`**: error logging for orphan alarms.
- **`./orphan-counter`**: the `inventoryCommitOrphanedTotal` metric.
- **`../model`**: `OPEN_RESERVATION_STATUSES` and the `ReservationStatus` type.
- **`../domain`** (`takeFromHold`) and **`@domain-primitives/time`** (`HOUR_MS`) are imported. Their use is not visible in the shown portion.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** is listed as a graph neighbor, but no interaction is visible in the shown code.

## Notes
- Orphan alarms are audited as the system because no `CallerContext` exists on payment or status-move paths.
- A missing hold at shipping is only logged, audited and counted. At commit, the orphan case also enqueues `HOLD_ORPHANED`.
- `retakeReleasedForOrder` must run inside the caller's transaction. It decides from the conditional claim, never from a prior read.
- Without a caller session, `claimAndApply` clears availability entries itself after commit. With a caller session, clearing is left to the caller.
- Committing a hold moves no counters and writes no ledger row. The payment date is the hold's `committedAt`.
