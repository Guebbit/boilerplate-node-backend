---
source: src/modules/returns/services/decide.ts
sha256: 2330f688b3914d034a279cb8a94291dd012bb318a1a5b5b209565d3575dcb6ee
generated_at: 2026-11-08T08:03:40.411982+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/decide.ts

## Purpose

Implements the two staff-facing mutations for a return request in the `requested` state: **approve** or **decline**. Each call performs a single conditional write (CAS-style status claim) so that concurrent staff members cannot both decide the same request—the loser receives a 409. Downstream effects (order timeline entry, `return.decided` outbox event, audit row, order-projection sync) are committed within the same transaction or immediately after, and the customer-facing email is deferred to the outbox consumer.

## Key elements

- **`approveReturn(id, context)`** — exported; delegates to `decide` with target status `'approved'` and an empty stamp.
- **`declineReturn(id, decline, context)`** — exported; validates that reason `'other'` carries a `message` (422 otherwise), then delegates to `decide` with the decline reason/message in the stamp.
- **`decide(id, to, stamp, context)`** — internal; runs `returnRepository.claimStatus` inside `withTransaction`, appends the order timeline row, and enqueues the `RETURN_DECIDED` outbox event. On a lost race, falls through to `notDecidable`.
- **`settleDecision(decided, to, id, context)`** — internal; post-commit work—nudges the outbox, best-effort reads the order to compute the `ownOrder` audit flag, records the audit row, and calls `syncReturnStatus`.
- **`notDecidable(id)`** — internal; distinguishes 404 (return not found) from 409 (exists but no longer in a decidable status).
- **`messageRequired()`** — internal; returns the 422 `fieldError` when declining with reason `'other'` and no message.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@infrastructure/i18n` (`index` / `context`) | `t()` localises error messages (`returns.not-decidable`, `returns.not-found`, `returns.decline-message-required`). |
| `@infrastructure/adapters/logger` | Logs an error if the best-effort order read in `settleDecision` fails. |
| `@infrastructure/http/response` | `generateSuccess`, `generateReject`, `fieldError` shape every HTTP response returned to the caller. |
| `@infrastructure/observability/audit` | `recordAudit` writes the audit row for the approval/decline action. |
| `@infrastructure/runtime/database` | `withTransaction` wraps the claim + timeline + outbox in a single transaction. |
| `@kernel/outbox` | `enqueueOutboxEvent(RETURN_DECIDED, …)` queues the domain event; `nudgeOutbox()` flushes it after the decision settles. |
| `@modules/access` | `ownOrderFlag(context, buyerId)` determines whether the deciding staff member is also the buyer, stored in audit metadata. |
| `@modules/orders` (index → services) | `orderService.appendTimeline` records the decision on the order; `orderService.getById` fetches the order for the audit flag; `buyerIdOf` extracts the buyer id. |
| `../repository` | `returnRepository.claimStatus` performs the conditional status transition; `findById` is used only in the error path. |
| `../audit` | `returnsAuditActions` supplies the action constants (`ADMIN_RETURN_APPROVED`, `ADMIN_RETURN_DECLINED`). |
| `../domain` (index) | `DECIDABLE_RETURN_STATUSES` defines the set of source statuses the claim is gated on. |
| `./projection` | `syncReturnStatus` refreshes the order's denormalised return-status projection. |

## Notes

- **Concurrency model:** the safety net is the `claimStatus` conditional update (WHERE status IN `DECIDABLE_RETURN_STATUSES`). There is no explicit lock; the second writer simply gets no row and is routed to `notDecidable`.
- **Withdrawals bypass this file.** A withdrawal is opened already in the `approved` state, so it never reaches `decide`.
- **`other` reason validation** happens *before* any database access—no write is attempted when the message is missing.
- **Audit is best-effort on the order read:** if `orderService.getById` throws, the `ownOrder` flag is omitted but the audit row is still written. The decision itself has already committed.
- **Stryker annotations** (`// Stryker disable all / restore all`) suppress mutation-testing coverage on the error-logging branch in `settleDecision`.
- The decline reason/message are stored on the return document; the file does not manage their retention or expiry—that is owned by the `reap:returns` job.
