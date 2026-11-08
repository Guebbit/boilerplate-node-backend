---
source: src/modules/returns/services/cancel.ts
sha256: 054089c4335c7b9ad0dbd04d0243593dba573f01246a316e615774c3a0664874
generated_at: 2026-11-08T08:02:14.912474+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/cancel.ts

## Purpose

Implements the staff action of canceling an approved return that will never be shipped (`approved → canceled`). This releases the held units and unblocks the order from staying `in_progress` indefinitely. It is pure bookkeeping—no refund, no stock adjustment, no event, no mail.

## Key elements

- **`cancelReturn(id, note, context)`** — Main export. Inside a single transaction it calls `returnRepository.claimStatus` (conditional write: only succeeds if the return is in a cancelable status), then appends a `return_canceled` row to the order's timeline. Outside the transaction it records an audit entry and calls `syncReturnStatus` to refresh the projection. Returns a 200 with the canceled document, or a 404/409 rejection.
- **`notCancelable(id)`** — Internal helper. Queries the repository to distinguish "return does not exist" (404) from "return exists but is not in a cancelable status" (409 with `RETURN_NOT_CANCELABLE`).

## Relationships

- **`@infrastructure/http/response`** — Builds the HTTP envelope via `generateSuccess` / `generateReject`; types `ResponseSuccess` / `ResponseReject` shape the return value.
- **`@infrastructure/i18n`** — Translates user-facing messages (`t('returns.not-cancelable')`, `t('returns.not-found')`).
- **`@infrastructure/observability/audit`** — Emits an audit record after a successful cancel via `recordAudit`.
- **`@infrastructure/runtime/database`** — Wraps the claim + timeline write in `withTransaction` so a lost race leaves no partial state.
- **`@modules/orders`** — Calls `orderService.appendTimeline` to log the cancel event on the order.
- **`../repository`** — `returnRepository.claimStatus` performs the conditional status transition; `returnRepository.findById` backs the 404/409 check.
- **`../model`** — `ReturnDocument` is the success payload type.
- **`../audit`** — Supplies the `returnsAuditActions.ADMIN_RETURN_CANCELED` action constant.
- **`../domain`** — Provides `CANCELABLE_RETURN_STATUSES` (the set of statuses from which cancellation is allowed).
- **`./projection`** — `syncReturnStatus` refreshes the order's return-status projection after the write.
- **`@types/auth-context`** — `CallerContext` identifies the staff actor for the timeline and audit rows.
- **`./index`** (services barrel) — Re-exports `cancelReturn` for consumers.

## Notes

- **Canceled ≠ Closed.** A canceled return holds no units and counts as zero goods received, so the same order lines can be returned again in the future.
- **A lost parcel is *not* canceled.** The shop bears transit risk; the refund may still be owed. The correct path is to receive the return with a restock count of 0, not to cancel it.
- **`note` lives only in the audit row.** The order timeline row carries IDs only (`returnId`, actor) to keep it lightweight.
- **Race-safe by construction.** `claimStatus` is a conditional write; if two staff cancel simultaneously, the second gets `null` back and the 404/409 branch handles it without a spurious audit or timeline entry.
