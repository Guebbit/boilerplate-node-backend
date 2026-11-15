---
source: src/modules/returns/services/outcome.ts
sha256: 361b2f897f0b4f474ecc67e07d49f1be810f52e36a496a6630820ef17036cae1
generated_at: 2026-11-14T21:39:17.292679+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/outcome.ts

## Purpose

Shared outcome builders for the two paths that write a return — `create.ts` (goods coming back) and `cancel-remainder.ts` (canceling an unshipped remainder). Centralizing the 201 success, all 4xx/5xx refusals, outbox-event writes, and the audit row here lets both callers import from one place without importing each other.

## Key elements

- **`CreateReturnInput`** — request shape a customer (or staff) sends to open a return or withdrawal; includes optional `kind`, `fulfillmentOrderId`, `lines`, `preferredRemedy`, and staff-only `requestedAt`/`statedVia`.
- **`Opener`** — bundles the `Statement` (date + optional channel) and `staffId` shared by both write-paths.
- **`CreateReturnOutcome`** — union of `ResponseSuccess<ReturnDocument>` | `ResponseReject`; the return type every builder below yields.
- **`opened`** — wraps a freshly-written `ReturnDocument` in a 201 success.
- **`badRemedy`** — 422 field-error when a remedy has no guarantee behind it.
- **`notReturnable`** — 409 when the order cannot accept a return.
- **`windowClosed`** — 409 when the return/withdrawal/guarantee window has expired; `guarantee` flag picks the message.
- **`badLines`** — 422 for a specific line-level failure (`nothing-returnable`, `unknown-product`, `too-many`, `excluded`).
- **`badCancellation`** — 422 for a structurally invalid cancellation request.
- **`badStatement`** — 422 field-error for an invalid `StatementVerdict` (missing date, wrong channel, future date, etc.).
- **`forbidden`** — 403 for a staff caller missing a permission key; calls `auditForbidden` before returning.
- **`nothingToCancel`** — 409 when there is no remainder to cancel or nothing has shipped.
- **`enqueueRequested`** — writes `return.requested` to the outbox inside the creating transaction, keyed on the order.
- **`enqueueApproved`** — writes `return.decided{approved}` immediately after `requested` for staff-pre-approved returns.
- **`returnClosedEvent`** — builds the `OutboxAnnouncement` for `return.closed` (shared payload shape for all three close-reasons).
- **`enqueueClosed`** — persists the `return.closed` announcement in the creating transaction.
- **`recordOpened`** — writes the audit row (`returnsAuditActions.RETURN_REQUESTED`) for a newly created return, noting `onBehalfOfBuyer` when staff acted.

## Relationships

- **`@domain-primitives/money`** — imports `padDecimal` to format `refundAmount` in the `returnClosedEvent` payload.
- **`@infrastructure/i18n`** — imports `t` for every localized error/success message.
- **`@infrastructure/http/response`** — imports `generateSuccess`, `generateReject`, `fieldError` and the `ResponseSuccess`/`ResponseReject` types; all outcome builders return one of these.
- **`@infrastructure/observability/audit`** — calls `recordAudit` inside `recordOpened`.
- **`@infrastructure/observability/forbidden`** — calls `auditForbidden` inside `forbidden`.
- **`@kernel/outbox`** — calls `enqueueOutboxEvent` in `enqueueRequested`, `enqueueApproved`, and `enqueueClosed`; imports the `OutboxAnnouncement` type for `returnClosedEvent`.
- **`@modules/orders`** — imports `OrderDocument` type used in `forbidden` and `recordOpened`.
- **`../domain`** — imports `ReturnReason`, `ProductQuantity`, `Statement`, `StatementVerdict` for typing inputs and the `badStatement` verdict parameter.
- **`../events`** — imports `RETURN_CLOSED`, `RETURN_DECIDED`, `RETURN_REQUESTED` event-name constants.
- **`../model`** — imports `ReturnDocument` (the aggregate shape returned in 201 responses and passed to all event/audit builders).
- **`../audit`** — imports `returnsAuditActions` for the action string in `recordOpened`.

## Notes

- The file is deliberately a leaf: it imports types and helpers but is imported only by the two write-paths (`create.ts`, `cancel-remainder.ts`). It must not import either of them.
- All outbox writes (`enqueueRequested`, `enqueueApproved`, `enqueueClosed`) accept a Mongoose `ClientSession` and are expected to run inside the same transaction that inserts the `ReturnDocument`, so the event and the document commit atomically.
- `forbidden` is the only builder that performs a side-effect (audit) before returning the rejection; every other builder is a pure response shape.
- `returnClosedEvent` is exported separately from `enqueueClosed` so callers can inspect or transform the announcement (e.g., for testing) without triggering a write.
- The `kind` discriminator (`return` vs `cancellation`) on `CreateReturnInput` gates which fields are meaningful: `fulfillmentOrderId` is required only for cancellations, `lines` must be absent for them.
