---
source: src/modules/inventory/services/holds.ts
sha256: d3c8b4c742a2c40c8e4fca7e50a411e29c586d927a1ff12c81a73871e6b5f807
generated_at: 2026-10-14T15:57:50.658400+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/holds.ts

## Purpose

Manages the post-creation lifecycle of inventory holds: committing at payment, shipping (full or partial), releasing (full or partial), and refreshing the stock cache. Every state transition uses a conditional "claim" write to guarantee at-most-once semantics, wrapped in a transaction for all-or-nothing counter updates.

## Key elements

- **`commitForOrder`** (exported) — Settles a hold at payment (`held → committed`). No counter moves; units remain reserved. If preorders become eligible, delegates to `allocateWithin`. Calls `nudgeOutbox` and refreshes the stock cache when it owns the transaction.
- **`shipForOrder`** (exported) — Takes a full hold off the shelf (`committed → shipped`, or `held → shipped` as a fallback for crashed commits). Both `onHand` and `reserved` drop; `available` is unchanged.
- **`shipLinesForOrder`** (exported) — Partial shipment: removes specific lines from an open hold, ending it `shipped` when empty.
- **`releaseLinesForOrder`** (exported) — Partial cancel: returns specific lines to the shelf, ending the hold `released` when empty.
- **`claimAndApply`** (internal) — Shared primitive: atomically claims a status transition and applies counter movements to every line. Opens its own transaction and refreshes the stock cache when no session is supplied.
- **`commitWithin`** (internal) — Transaction-body for `commitForOrder`: claims, then serves eligible preorder lines via `allocateWithin`.
- **`takeLines`** (internal) — Shared body for partial ship/release: finds the open hold, splits lines with `takeFromHold`, replaces items, and applies counter movements to the taken subset.
- **`raiseOrphanAlarm`** (internal) — Logs an error and records an audit entry when a paid/shipping order has no valid hold (missing, released, or expired). Uses `SYSTEM_ACTOR` since no human caller exists on these paths.

## Relationships

- **`src/modules/inventory/repository.ts`** — Primary data access; calls `claimStatus`, `findByOrderId`, `findOpenByOrderId`, `replaceItems`.
- **`src/modules/inventory/domain/index.ts` / `domain/hold-lines.ts`** — `takeFromHold` provides the pure line-splitting logic used by `takeLines`.
- **`src/modules/inventory/services/allocate.ts`** — `allocateWithin` fulfills preorder lines once stock arrives, called from `commitWithin`.
- **`src/modules/inventory/services/returns.ts`** — Supplies `refreshStockCacheForProducts`; this file wraps it in `refreshStockCacheForOrder` (defined in the truncated section).
- **`src/modules/inventory/services/transition.ts`** (via `./transition`) — `applyToEveryLine` performs the per-line counter write.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps standalone calls that must be atomic.
- **`src/kernel/outbox.ts`** — `nudgeOutbox` is called after a commit that triggered preorder allocations, so downstream events are dispatched.
- **`src/kernel/permissions.ts`** — `SYSTEM_ACTOR` and `callerForSubject` build the audit caller for orphan alarms (no human context available).
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` persists the orphan-alarm audit trail.
- **`src/modules/inventory/audit.ts`** — Provides the `inventoryAuditActions` enum (e.g. `ADMIN_COMMIT_ORPHANED`).
- **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — Consumer: exercises the ship/release paths end-to-end in tests.

## Notes

- **At-most-once guarantee** relies on the conditional `claimStatus` write (single MongoDB `findOneAndUpdate` with a status filter). A retry after a crash re-enters the claim; if the hold is already past the source status it returns `null` and the caller treats it as a replay.
- **Orphan alarm vs. replay:** a claim miss is *not* silently ignored. The code reads the current status to distinguish a benign replay (`committed`/`shipped`) from a genuine problem (`released`/`expired`/missing), which triggers `raiseOrphanAlarm`.
- **Stryker annotations:** `raiseOrphanAlarm` is wrapped in `// Stryker disable all … restore all` to suppress mutation testing on the logging/audit path (side-effect-only function).
- **Transaction ownership:** every public export accepts an optional `session`. When omitted, the function opens its own transaction *and* performs post-commit side effects (cache refresh, outbox nudge). Callers that pass a session are responsible for those side effects after their own commit.
- **Preorder handling in commit:** `commitWithin` filters hold items by `kind === 'preorder'` and calls `allocateWithin` to serve units whose stock has already arrived. The commit itself performs no counter movement.
