---
source: src/modules/returns/services/cancel.ts
sha256: 778b05585563fa638e640eeb0cbe4fe8bb076ccfc7d281a435a13592e5c22b47
generated_at: 2026-11-14T21:37:17.518426+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/cancel.ts

## Purpose

Implements the `approved → canceled` lifecycle transition for an approved return whose goods were never sent. It is a staff-only, bookkeeping-only action (no money movement, no stock adjustment, no outbound event, no mail) that releases the return's held units so the order can progress past `in_progress`.

## Key elements

- **`cancelReturn(id, note, context)`** — The sole export. Within a single transaction it (1) atomically claims the `approved → canceled` transition via `returnRepository.claimStatus`, (2) appends a `return_canceled` row to the order timeline. After the transaction it records an audit entry, syncs the return status projection, and returns a 200 with the updated `ReturnDocument`, or a 404/409 rejection.
- **`notCancelable(id)`** (internal) — Builds the rejection response: 404 if the return doesn't exist, 409 with `RETURN_REFUND_OPEN` if a proof-of-sending refund is owed, 409 with `RETURN_NOT_CANCELABLE` otherwise.

## Relationships

- **`src/modules/returns/repository.ts`** — `findById` (rejection path) and `claimStatus` (atomic state write with the `$nor` refund guard).
- **`src/modules/orders/index.ts`** — the order service used to append the `return_canceled` timeline row inside the same transaction.
- **`src/modules/returns/domain/index.ts`** (re-exports from `lifecycle.ts` / `refund-due.ts`) — provides `returnLifecycle` (the `from`/`to` states for the claim), `proofOpenedRefund`, and `PROOF_OPENS_REFUND_FOR` (the refund-owed guard).
- **`src/modules/returns/services/projection.ts`** — `syncReturnStatus` recomputes the order's aggregate status after cancellation.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps the claim + timeline write so a lost race produces no partial row.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape the HTTP payload.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` logs the admin action.
- **`src/infrastructure/i18n/index.ts`** — `t()` localizes user-facing error messages.
- **`src/modules/returns/audit.ts`** — provides the audit action constant used when recording the cancel event.
- **`src/modules/returns/model.ts`** — `ReturnDocument` return type.

## Notes

- `canceled` is **not** `closed`: a canceled return holds no units and counts as no goods returned, so the same order lines remain returnable.
- A parcel lost in transit must **not** be canceled; the shop bears that risk and the return is instead received with a restock count of 0.
- The `$nor` filter inside `claimStatus` makes the "refund already owed by proof of sending" check part of the atomic write — a concurrent refund-opening cannot be cancelled out.
- The `note` (free-text reason) lives only in the audit metadata; the order timeline row carries ids only.
