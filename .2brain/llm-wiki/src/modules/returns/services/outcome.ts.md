---
source: src/modules/returns/services/outcome.ts
sha256: 0d8ff5943a91f64457e336a46ef93fd6f318dfccf786a074828c6a7c54b9e3f7
generated_at: 2026-11-08T08:04:48.771095+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/outcome.ts

## Purpose

Shared response and side-effect builders for "opening a return." Both the goods-return path (`create.ts`) and the cancel-remainder path (`cancel-remainder.ts`) import from this single module so neither needs to import the other. It centralises the 201 success shape, every 409/422/403 refusal the two paths can produce, the outbox event writes that accompany a freshly created return, and the audit row.

## Key elements

- **`CreateReturnInput`** — the DTO a customer (or staff acting for one) submits: order id, reason, optional `kind` (`return` | `cancellation`), `fulfillmentOrderId`, preferred remedy, line quantities, and staff-only `requestedAt` / `statedVia`.
- **`Opener`** — small struct pairing a `Statement` with the optional `staffId`; shared by both write paths.
- **`CreateReturnOutcome`** — union of `ResponseSuccess<ReturnDocument>` and `ResponseReject`; the return type of every builder below.
- **`opened(created)`** — 201 success wrapper.
- **`badRemedy`, `notReturnable`, `windowClosed`, `badLines`, `badCancellation`, `withdrawalIsTheBuyers`, `badStatement`, `forbidden`, `nothingToCancel`** — one function per distinct refusal the two paths can emit. Each returns a `ResponseReject` with a stable `ERROR_CODES.*` value and an i18n message.
- **`enqueueRequested` / `enqueueApproved` / `enqueueClosed`** — write `return.requested`, `return.decided`, and `return.closed` outbox events inside the caller's Mongoose transaction, keyed on `orderId` for ordering.
- **`returnClosedEvent(closed)`** — pure builder that produces the `OutboxAnnouncement` payload (including `padDecimal`-formatted refund amount); consumed by `enqueueClosed` and available for other callers.
- **`recordOpened(order, created, context)`** — writes the `recordAudit` row for a freshly created return; flags `onBehalfOfBuyer` when staff opened it.

## Relationships

- **`@infrastructure/http/response`** — provides `generateSuccess`, `generateReject`, `fieldError`, and the `ResponseSuccess`/`ResponseReject` types every builder returns.
- **`@infrastructure/i18n`** — `t()` resolves every user-facing message key.
- **`@domain-primitives/money`** — `padDecimal` formats `refundAmount` in `returnClosedEvent`.
- **`@infrastructure/observability/audit`** — `recordAudit` called by `recordOpened`.
- **`@infrastructure/observability/forbidden`** — `auditForbidden` called inside `forbidden()` before returning the 403.
- **`@kernel/outbox`** — `enqueueOutboxEvent` and the `OutboxAnnouncement` type back all three enqueue helpers.
- **`../model`** — `ReturnDocument` is the domain shape every function reads or returns.
- **`../events`** — `RETURN_REQUESTED`, `RETURN_DECIDED`, `RETURN_CLOSED` names passed to the outbox.
- **`../audit`** — `returnsAuditActions.RETURN_REQUESTED` used as the audit action key.
- **`@modules/orders`** — `OrderDocument` type for the `forbidden` and `recordOpened` signatures.
- **`../domain`** — `ReturnReason`, `ProductQuantity`, `Statement`, `StatementVerdict` used in input types and the `badStatement` verdict parameter.

## Notes

- The module is intentionally dependency-free of `create.ts` and `cancel-remainder.ts`; the design note in the file header calls out that neither imports the other. This file is the single place that knows every refusal shape.
- `windowClosed` takes a single boolean (`guarantee`) rather than a union to pick between two i18n sentences — the error code is the same (`RETURN_WINDOW_CLOSED`).
- `forbidden` is the one builder that *audits before returning*; no route-level guard can see this refusal because the missing permission depends on order state resolved at runtime.
- All three `enqueue*` helpers accept a `ClientSession` and are meant to be called inside the same Mongoose transaction that writes the return document, guaranteeing event/return atomicity.
- `returnClosedEvent` is exported separately from `enqueueClosed` so other callers (e.g., a later close transition) can reuse the payload shape without a transaction.
