---
source: src/modules/returns/services/outcome.ts
source_sha256: 8abb0df1063beceb09ae3e62dbeb6b2cc6fe5fa9d746224a39acb9989ec4954b
context_sha256: 3f77367b4b5428fa8da3946333131cd5bad84d8d0dc241a2bb68d01dfafc063c
generated_at: 2026-11-22T07:30:44.533286+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/services/outcome.ts

## Purpose
Shared home for what opening a return answers with, plus the refusals and writes common to both ways of opening one: `create.ts` (goods coming back) and `cancel-remainder.ts` (canceling an unshipped remainder). Keeping them here means neither of those files imports the other.

## Key elements
- **`CreateReturnInput`** – request shape for opening a return or withdrawal: `orderId`, `reason`, optional `kind`, `fulfillmentOrderId` (only for cancellations), `note`, `preferredRemedy`, `lines`, and staff-only `requestedAt` / `statedVia`.
- **`Opener`** – who opens a return: the `Statement` (date, and channel for a withdrawal) and the optional `staffId` of a staff member acting for the buyer.
- **`CreateReturnOutcome`** – `ResponseSuccess<ReturnDocument> | ResponseReject`.
- **`opened(created)`** – the 201 success response for a written return.
- **Refusal builders** (all localized via `t(...)`, with `ERROR_CODES` where applicable):
  - `badRemedy(field)` – 422 field error for an unsupported remedy.
  - `notReturnable()` – 409, order cannot have a return opened.
  - `windowClosed(guarantee?)` – 409, with the message varying between withdrawal/goodwill period and guarantee period.
  - `badLines(reason)` – 422, one code with the message chosen from `nothing-returnable`, `unknown-product`, `too-many`, `excluded`.
  - `badCancellation()` – 422, malformed cancellation.
  - `badStatement(verdict)` – 422 field error built from a failed `StatementVerdict`.
  - `forbidden(order, permission, context)` – 403 for a staff caller missing a permission. It also writes an audit entry via `auditForbidden`.
  - `nothingToCancel()` – 409, nothing left to cancel or nothing shipped.
- **Outbox writers** (take a mongoose `ClientSession`, so they run in the creating transaction):
  - `enqueueRequested` – `return.requested`.
  - `enqueueApproved` – `return.decided` with decision `approved`.
  - `enqueueClosed` – `return.closed` for a return born closed.
- **`returnClosedEvent(closed)`** – builds the `return.closed` announcement (refund amount padded via `padDecimal`, currency, optional remedy). It is a single payload for the three ways a return closes.
- **`recordOpened(order, created, context)`** – writes the return-requested audit row. Adds `onBehalfOfBuyer: true` when `openedBy === 'staff'`.

## Relationships
- **`infrastructure/http/response`** – `generateSuccess`, `generateReject` and `fieldError` build all responses.
- **`infrastructure/i18n`** – `t` supplies every message. The `i18n/context` neighbor is not imported directly here.
- **`infrastructure/observability/audit` and `forbidden`** – `recordAudit` is used by `recordOpened`, and `auditForbidden` by `forbidden`.
- **`returns/audit`** – supplies the `returnsAuditActions` constants used by `recordOpened`.
- **`kernel/outbox`** – `enqueueOutboxEvent` and the `OutboxAnnouncement` type.
- **`returns/events`** – event names `RETURN_REQUESTED`, `RETURN_DECIDED`, `RETURN_CLOSED`.
- **`returns/model`** – `ReturnDocument` type.
- **`modules/orders`** – `OrderDocument` type.
- **`returns/domain`** – types `ReturnReason`, `ProductQuantity`, `Statement`, `StatementVerdict`.
- **`domain-primitives/money`** – `padDecimal` formats the refund amount.

## Notes
- Event writes are keyed on `orderId` (the aggregate id), so one order's return events stay in order.
- `enqueueRequested`, `enqueueApproved` and `enqueueClosed` expect the caller's transaction session. The event then exists exactly when the return does.
- `forbidden` is audited here because no route guard can see this refusal: the required key (`create:Refund` or `update:Order`) depends on the order.
- `recordOpened` does not write events. Those are enqueued with the return itself.
