---
source: src/modules/returns/services/cancel.ts
sha256: 054089c4335c7b9ad0dbd04d0243593dba573f01246a316e615774c3a0664874
generated_at: 2026-10-29T05:41:24.938098+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/cancel.ts

## Purpose

Implements the staff action of canceling an approved return whose goods were never shipped (`approved → canceled`). It exists to release units held by a return that will never arrive, preventing the parent order from being stuck at `in_progress` indefinitely. The operation is bookkeeping only: no money moves, no stock adjusts, no event fires, no mail is sent.

## Key elements

- **`cancelReturn(id, note, context)`** — Exported entry point. Runs a single transaction that (1) conditionally flips the return to `canceled` via `claimStatus` and (2) appends a `return_canceled` row to the order timeline. After the transaction, records an audit entry and calls `syncReturnStatus`. Returns `200` with the updated document, or `404`/`409` on failure.
- **`notCancelable(id)`** — Internal helper. Distinguishes "return does not exist" (404) from "exists but not in a cancelable status" (409) by re-querying the repository.
- **`CANCELABLE_RETURN_STATUSES`** — Imported from `../domain`; defines which current statuses permit the cancel transition (in practice, only `approved`).

## Relationships

- **`../repository`** — Calls `claimStatus` (atomic conditional update) and `findById` (for the 404/409 distinction).
- **`@modules/orders`** — Calls `orderService.appendTimeline` within the same transaction to log the cancellation on the order.
- **`./projection`** — Calls `syncReturnStatus` after the transaction to refresh any denormalized order status.
- **`@infrastructure/runtime/database`** — Wraps the write in `withTransaction`.
- **`@infrastructure/observability/audit`** — Emits `recordAudit` with action `ADMIN_RETURN_CANCELED` after a successful cancel.
- **`@infrastructure/http/response`** — Shapes the HTTP response via `generateSuccess` / `generateReject`.
- **`@infrastructure/i18n`** — Localizes the 409 error message.
- **`../audit`** — Supplies the `returnsAuditActions` enum member used in the audit record.
- **`../model`** — Imports the `ReturnDocument` type.
- **`@types/auth-context`** — Accepts `CallerContext` to identify the acting staff member.

## Notes

- `canceled` is deliberately distinct from `closed`: a canceled return holds **no** units and counts as **no** goods returned, so the same order lines can be returned again later.
- A parcel lost in transit is **not** a cancel. The shop bears that risk; the return is instead received with a restock count of 0 (refund may still be owed).
- The optional `note` is stored only in the audit row's `metadata`; the order timeline row carries IDs and actor only.
- The `claimStatus` call is a conditional (optimistic) write: if another actor changed the status first, the transaction produces no row and the caller gets a 409.
- The function performs exactly one write to the return record and one write to the order timeline, both inside a single database transaction.
