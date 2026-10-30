---
source: src/modules/returns/services/decide.ts
sha256: 2330f688b3914d034a279cb8a94291dd012bb318a1a5b5b209565d3575dcb6ee
generated_at: 2026-10-29T05:42:39.276213+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/decide.ts

## Purpose

Handles a staff member's decision on a return request: approve or decline with a reason. Each decision is a conditional write from `requested` status, so concurrent decisions on the same request are mutually exclusive — the loser receives a 409. After the write commits, the file records an audit row, nudges the outbox, and syncs the order's return-status projection.

## Key elements

- **`approveReturn(id, context)`** *(exported)* — Approves a return request. Delegates to `decide` with an empty stamp.
- **`declineReturn(id, decline, context)`** *(exported)* — Declines a return request. Validates that `reason === 'other'` carries a non-empty message (422 if not), then delegates to `decide` with `declineReason`/`declineMessage` in the stamp.
- **`decide(id, to, stamp, context)`** *(internal)* — Core shared path: within a `withTransaction`, calls `returnRepository.claimStatus` (conditional write gated on `DECIDABLE_RETURN_STATUSES`), appends an order timeline entry, and enqueues the `RETURN_DECIDED` outbox event. On success delegates to `settleDecision`; on a lost race calls `notDecidable`.
- **`settleDecision(decided, to, id, context)`** *(internal)* — Post-commit steps: nudges the outbox, reads the order (best-effort) to compute `ownOrderFlag`, records the audit row, calls `syncReturnStatus`, and returns the 200 response.
- **`notDecidable(id)`** *(internal)* — Reads the return to distinguish 404 (not found) from 409 (already decided) for the error response.
- **`messageRequired()`** *(internal)* — Builds the 422 `fieldError` response for a missing decline message.

## Relationships

- **`@infrastructure/runtime/database`** — `withTransaction` wraps the claim + timeline + outbox so they commit atomically.
- **`@kernel/outbox`** — `enqueueOutboxEvent` persists the `RETURN_DECIDED` event inside the transaction; `nudgeOutbox` triggers dispatch after commit.
- **`@modules/orders`** — `orderService.appendTimeline` (in-transaction) and `orderService.getById` (post-commit, for the audit flag); `buyerIdOf` extracts the buyer ID for that flag.
- **`@modules/access`** — `ownOrderFlag` determines whether the deciding staff member is also the buyer, written into the audit metadata.
- **`@infrastructure/observability/audit`** — `recordAudit` writes the audit row (action from `returnsAuditActions`).
- **`@modules/returns/audit`** — Supplies the audit action constants `ADMIN_RETURN_APPROVED` / `ADMIN_RETURN_DECLINED`.
- **`@modules/returns/domain`** — `DECIDABLE_RETURN_STATUSES` defines which statuses can transition to a decision (i.e., only `requested`).
- **`@infrastructure/http/response`** — `generateSuccess`, `generateReject`, `fieldError` shape all HTTP responses.
- **`@infrastructure/i18n`** — `t()` localizes error and validation messages.
- **`@infrastructure/adapters/logger`** — Logs an error if the post-commit order read fails (non-fatal).
- **`./projection`** — `syncReturnStatus` refreshes the order's denormalized return-status field after a decision commits.

## Notes

- The conditional write (`claimStatus` filtered on `DECIDABLE_RETURN_STATUSES`) is the concurrency guard. A lost race writes nothing and returns 409; no rollback logic is needed.
- The `ownOrderFlag` read in `settleDecision` is intentionally best-effort: if the order fetch fails the flag is simply omitted from the audit metadata, and the decision itself is already committed.
- Customer-facing notification is *not* sent here; it rides the `RETURN_DECIDED` outbox event consumed downstream.
- A decline's `declineMessage` is stored on the return document. The file's comment notes that `reap:returns` owns the clock for expiring that reason, not this module.
- The `Stryker disable/restore` comments around the logger call indicate that branch is deliberately excluded from mutation-testing (it is an unreachable-in-practice error path).
