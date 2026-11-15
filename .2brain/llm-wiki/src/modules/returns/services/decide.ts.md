---
source: src/modules/returns/services/decide.ts
sha256: 8320c6b821952dbfb0d42ad2b08b57bb3120c2d694a699566a2faa5a6190f215
generated_at: 2026-11-14T21:38:35.366731+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/decide.ts

## Purpose

Implements the two staff actions on a pending return request — **approve** and **decline** — as a single conditional (optimistic-lock) write. Two staff members racing on the same request cannot both succeed; the loser receives a 409. Withdrawals never pass through this file because they open already approved.

## Key elements

- **`approveReturn(id, context)`** — Public entry point. Calls the shared `decide` helper with the `approve` event and an empty stamp.
- **`declineReturn(id, decline, context)`** — Public entry point. Validates that reason `"other"` carries a `message` (returns 422 early, before any write), then calls `decide` with a stamp containing `declineReason` / `declineMessage`.
- **`decide(id, event, stamp, context)`** *(internal)* — The shared transactional path:
  1. Opens a DB transaction (`withTransaction`).
  2. Calls `returnRepository.claimStatus` to atomically move the row from the event's `from` status to its `to` status, stamping `decidedAt` and any decline fields.
  3. On success: appends a timeline entry to the parent order, enqueues the `RETURN_DECIDED` outbox event.
  4. On failure (row already moved / not found): falls through to `notDecidable`.
- **`settleDecision(decided, to, id, context)`** *(internal)* — Post-commit work: nudges the outbox, reads the order to compute the `ownOrderFlag` audit metadata (non-fatal — a read error only loses the flag), records the audit row, and triggers `syncReturnStatus` projection.
- **`notDecidable(id)`** *(internal)* — Distinguishes 404 (return does not exist) from 409 (exists but is no longer in a decidable state) for the response body.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps the claim + timeline + outbox enqueue into a single atomic unit.
- **`src/kernel/outbox.ts`** — `enqueueOutboxEvent` writes the `RETURN_DECIDED` event inside the transaction; `nudgeOutbox` is called after commit to trigger dispatch.
- **`src/modules/orders/index.ts`** — Provides `orderService` (used to append a timeline entry on the parent order and to read the order for the audit flag) and `buyerIdOf` (extracts the buyer ID for `ownOrderFlag`).
- **`src/modules/access/index.ts`** — `ownOrderFlag(context, buyerId)` determines whether the deciding staff member is the order's buyer; the result is stored in audit metadata.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` writes the staff action log (approve/decline, success, target, `ownOrderFlag`).
- **`src/modules/returns/domain/index.ts`** — Re-exports `RETURN_EVENTS` (maps event name → `{ from, to }`) and `returnLifecycle` (resolves the expected prior status via `fromOf`).
- **`src/modules/returns/domain/lifecycle.ts`** — Source of the `returnLifecycle` helper used to derive the `from` status for the conditional write.
- **`src/modules/returns/audit.ts`** — `returnsAuditActions` supplies the stable audit-action identifiers (`ADMIN_RETURN_APPROVED`, `ADMIN_RETURN_DECLINED`).
- **`src/infrastructure/i18n/index.ts`** — `t()` localises user-facing error strings (409 message, 422 field error).
- **`src/infrastructure/http/response.ts`** — `generateSuccess`, `generateReject`, and `fieldError` shape the HTTP response.
- **`src/infrastructure/adapters/logger.ts`** — `logger` is used to log (non-fatal) failures when reading the order for the audit flag.

## Notes

- **Race safety is at the DB level.** `claimStatus` performs a conditional UPDATE; if the row's current status no longer matches the expected `from`, the function returns `null` and no timeline, outbox, or audit writes occur.
- **Audit is written outside the transaction.** `settleDecision` runs after `withTransaction` resolves, so a crash between commit and audit loses the audit row but not the decision.
- **The order read for `ownOrderFlag` is best-effort.** A failure logs an error and continues; the audit row is still recorded, just without the flag.
- **`decidedAt` is stamped in the same statement as the status change** (spread into the `stamp` passed to `claimStatus`), guaranteeing it is never written without the status transition.
- **The `to` value comes from `RETURN_EVENTS[event].to`**, not from a widened domain type, so the event payload and timeline entry only ever carry `"approved"` or `"declined"`.
