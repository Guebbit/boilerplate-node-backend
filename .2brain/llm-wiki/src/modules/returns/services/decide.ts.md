---
source: src/modules/returns/services/decide.ts
source_sha256: 9bf173aa6449166597dc1dec781218ef5d50bb972319a39f54d977c24ffb61dc
context_sha256: 6e7719bc24c974d3f4b11caabf83b13df2f47893b0cbeeb8e0fe55c331fb12ba
generated_at: 2026-11-22T07:29:36.636196+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/decide.ts

## Purpose
Handles staff decisions on a return request: approve it, or decline it with a reason. Each decision is a single conditional write from `requested`, so if two staff members decide the same request concurrently, only one wins and the other is told the request was already decided. Withdrawals never come through here, since they are opened already decided.

## Key elements
- `approveReturn(id, context)` — approves a return by calling `decide` with the `approve` event and an empty stamp.
- `declineReturn(id, decline, context)` — declines a return with a reason code and an optional message. If the reason is `other` and no message is given, it returns a 422 field error (`returns.decline-message-required`) before anything is written. Otherwise it stamps `declineReason` and, when present, `declineMessage`.
- `decide` (internal) — shared path for both decisions. Inside `withTransaction` it:
  1. Calls `returnRepository.claimStatus` from the lifecycle's source status for the event to the target status, stamping `decidedAt`.
  2. On a win, appends an order timeline entry (`return_approved` or `return_declined`).
  3. Enqueues the `RETURN_DECIDED` outbox event with `returnId`, `orderId` and `decision`.
  
  A lost claim writes nothing and falls through to `notDecidable`.
- `settleDecision` (internal) — runs after a won claim. It calls `nudgeOutbox()`, reads the order, records the audit row, runs `syncReturnStatus` on the order, and returns a 200 success.
- `notDecidable` (internal) — chooses the error for a lost claim. It returns 409 (`RETURN_NOT_DECIDABLE`) if the return exists, or 404 (`returns.not-found`) if not.

## Relationships
- **`../repository`** (`returnRepository`) — provides `claimStatus` (the conditional write) and `findById` (used only to pick the 404 or 409).
- **`../domain`** — `RETURN_EVENTS` supplies the target status, and `returnLifecycle` supplies the allowed source status.
- **`@modules/orders`** — the order service writes the timeline entry inside the transaction and reads the order afterwards for the audit flag; `buyerIdOf` extracts the buyer from that order.
- **`@modules/access`** — `ownOrderFlag` adds the `ownOrder` flag to audit metadata. It marks a staff member approving or declining their own return.
- **`../audit`** and **`@infrastructure/observability/audit`** — `returnsAuditActions` supplies `ADMIN_RETURN_APPROVED` and `ADMIN_RETURN_DECLINED`. `recordAudit` writes the row.
- **`@kernel/outbox`** — `enqueueOutboxEvent` commits the `RETURN_DECIDED` event with the decision. `nudgeOutbox` wakes the outbox afterwards.
- **`@infrastructure/runtime/database`** — `withTransaction` wraps the claim, timeline and outbox writes.
- **`@infrastructure/http/response`** — `generateSuccess`, `generateReject` and `fieldError` build the responses.
- **`@infrastructure/i18n`** — `t` translates the error messages.
- **`@infrastructure/adapters/logger`** — logs a failed order read in `settleDecision`.
- **`./projection`** (`syncReturnStatus`) — updates the order's projection after the decision.

## Notes
- The claim, order timeline row and outbox event commit together. The audit row and the projection sync happen after the commit.
- A failed order read in `settleDecision` is logged and swallowed. It costs only the `ownOrder` audit flag, never the audit row or the decision.
- The customer's notification email is not sent here. It rides on the outbox event.
- A decline's reason stays on the return document, where `reap:returns` owns its clock.
- `notDecidable` runs a read after the write has already failed. It only chooses the message and does not decide the outcome.
