---
source: src/modules/inventory/services/holds.ts
sha256: 95f177c9abc58112d12e799e30ebdefac0190d62e1d6c9ae9dbfb8b7de4f5aaf
generated_at: 2026-10-15T10:36:02.827068+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/holds.ts

## Purpose

Implements the post-creation lifecycle of inventory holds: committing at payment, shipping at dispatch (full or partial), releasing on cancel (full or partial), and the associated stock-cache refresh. Each operation uses a claim-then-act pattern inside a transaction so that a hold's status change and its counter movements are atomic and at-most-once.

## Key elements

- **`claimAndApply`** (private) — Core primitive: atomically claims a hold's status transition and applies the counter movement to every line in one transaction. If no session is supplied, opens its own and refreshes the stock cache on commit.
- **`commitForOrder`** (exported) — Settles a hold at payment (`held → committed`). No counter movement; units stay reserved. On a missed claim, distinguishes benign replay (already `committed`/`shipped`) from an orphan alarm. If preorder lines were allocated, nudges the outbox.
- **`shipForOrder`** (exported) — Full dispatch: `committed → shipped` (or `held → shipped` if a prior commit crashed). Drops `onHand` and `reserved` by the held quantity, leaving `available` unchanged.
- **`shipLinesForOrder`** (exported) — Partial shipment: removes specific lines from an open hold, drops counters only for those lines, and ends the hold `shipped` once empty.
- **`releaseLinesForOrder`** (exported) — Partial cancel: removes specific unshipped lines, drops `reserved` only (units return to shelf), ends the hold `released` once empty.
- **`commitWithin`** (private) — Transaction-body of `commitForOrder`; after a successful claim, calls `allocateWithin` for any preorder lines that now have stock.
- **`takeLines`** (private) — Shared body for `shipLinesForOrder` / `releaseLinesForOrder`: finds an open hold, splits items via `takeFromHold`, replaces remaining lines, then applies counters to the taken lines.
- **`raiseOrphanAlarm`** (private) — Logs an error and records a system-actor audit event when a paid/shipping order has no valid hold.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps every standalone claim-and-apply so status + counters land atomically.
- **`src/modules/inventory/repository.ts`** — `reservationRepository` supplies `claimStatus`, `findByOrderId`, `findOpenByOrderId`, and `replaceItems`.
- **`src/modules/inventory/services/transition.ts`** — `applyToEveryLine` performs the per-line counter arithmetic; `refreshStockCacheForProducts` (via `refreshStockCacheForOrder`) invalidates the catalogue cache after commit.
- **`src/modules/inventory/services/allocate.ts`** — `allocateWithin` serves preorder lines whose stock has arrived, called from `commitWithin`.
- **`src/modules/inventory/domain/hold-lines.ts`** (via `domain/index.ts`) — `takeFromHold` splits hold items into `remaining` / `taken` for partial operations.
- **`src/modules/inventory/model.ts`** — `ReservationStatus` type used throughout.
- **`src/modules/inventory/audit.ts`** — `inventoryAuditActions` provides the audit action identifiers for orphan events.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the orphan-alarm audit entry.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` surfaces orphan alarms in structured logs.
- **`src/kernel/outbox.ts`** — `nudgeOutbox` signals the outbox worker after a commit triggered preorder allocations.
- **`src/kernel/permissions.ts`** — `SYSTEM_ACTOR` and `callerForSubject` construct the audit actor (no human caller exists on these paths).
- **`src/modules/inventory/services/sweep.ts`** — The retry sweep that re-runs stuck commits; its interaction is implicit (a `held` hold that `shipForOrder` encounters may be the sweep's leftover).
- **`src/modules/inventory/services/index.ts`** — Barrel re-export of the public functions in this file.
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Exercises the ship/release paths from the delivery side.

## Notes

- **No counter movement on commit.** `commitForOrder` only flips status; the ledger records nothing because the counters don't change. The only observable side-effect is the `committedAt` timestamp and preorder allocation.
- **`shipForOrder` has a fallback claim.** It first tries `committed → shipped`, then `held → shipped`, covering the window where a crashed settlement left the hold still `held`.
- **Session parameter is a contract.** When a caller supplies a session, it owns post-commit duties (cache refresh, outbox nudge). When absent, this module opens its own transaction and performs those duties itself.
- **Orphan alarm is audited, not thrown.** The function logs and records an audit event, then returns `false` to the caller; it does not raise.
- **Stryker suppression.** The `logger.error` call in `raiseOrphanAlarm` is wrapped in `Stryker disable/restore` because mutation-testing the message string adds no value.
