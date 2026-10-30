---
source: src/modules/returns/services/outcome.ts
sha256: 613c48798315b9a5ac46658cf80ee5c71ed3e793308c46e7a5cc52acf7f29213
generated_at: 2026-10-29T05:43:51.390504+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/outcome.ts

## Purpose

Shared vocabulary for what "opening a return" answers with: the input types both writers accept, the success/refusal HTTP responses they return, the outbox events they enqueue in the creating transaction, and the audit row they leave. It exists as a single home so `create.ts` (goods coming back) and `cancel-remainder.ts` (unshipped remainder cancelled) never import each other.

## Key elements

- **`CreateReturnInput`** – the request body shape for opening a return or withdrawal (order, reason, kind, lines, remedy, staff statement fields).
- **`Opener`** – the shared `{ statement, staffId }` pair both write-paths pass to record who/when/where a buyer stated their intent.
- **`CreateReturnOutcome`** – the union `ResponseSuccess<ReturnDocument> | ResponseReject` every factory returns.
- **`opened(created)`** – builds the 201 success response for a newly written return.
- **Refusal factories** – each returns a typed `ResponseReject`:
  - `badRemedy(field)` – 422, remedy without guarantee.
  - `notReturnable()` – 409, order not eligible.
  - `windowClosed(guarantee?)` – 409, time window expired (picks message by reason type).
  - `badLines(reason)` – 422, one of four line-validation failures.
  - `badCancellation()` – 422, cancellation shape mismatch.
  - `withdrawalIsTheBuyers()` – 422, staff cannot write a withdrawal on buyer's behalf.
  - `badStatement(verdict)` – 422, statement date/channel invalid; emitted as a field error.
  - `forbidden(order, permission, context)` – 403, staff lacks a required key; also calls `auditForbidden`.
  - `nothingToCancel()` – 409, no remainder left.
- **`enqueueRequested(created, session)`** – writes `RETURN_REQUESTED` to the outbox inside the creating transaction.
- **`enqueueApproved(created, session)`** – writes `RETURN_DECIDED` (decision: approved) immediately after `requested` for staff-opened returns.
- **`returnClosedEvent(closed)`** – builds the `OutboxAnnouncement` for `RETURN_CLOSED` (one payload for all three close reasons).
- **`enqueueClosed(created, session)`** – writes that `RETURN_CLOSED` announcement in the creating transaction.
- **`recordOpened(order, created, context)`** – writes the audit row for a new return; flags `onBehalfOfBuyer` when staff opened it.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@infrastructure/http/response` | Imports `fieldError`, `generateReject`, `generateSuccess`, and the `ResponseReject`/`ResponseSuccess` types to build every response. |
| `@infrastructure/i18n` | Calls `t()` for all user-facing messages. |
| `@infrastructure/observability/audit` | Calls `recordAudit` in `recordOpened`. |
| `@infrastructure/observability/forbidden` | Calls `auditForbidden` inside `forbidden`. |
| `@kernel/outbox` | Calls `enqueueOutboxEvent` and uses the `OutboxAnnouncement` type for all event writes. |
| `@modules/orders` | Imports the `OrderDocument` type used in `forbidden` and `recordOpened`. |
| `../model` | Imports `ReturnDocument` as the success payload type. |
| `../audit` | Imports `returnsAuditActions` for the audit action constant. |
| `../events` | Imports `RETURN_REQUESTED`, `RETURN_DECIDED`, `RETURN_CLOSED` event name constants. |
| `../domain` | Imports `ReturnReason`, `ProductQuantity`, `Statement`, `StatementVerdict` for type signatures. |
| `../services/cancel-remainder.ts` | Sibling consumer: uses the refusal factories and event enqueuers defined here (does not import this file's success path directly, but shares the module). |

## Notes

- **No mutual imports by design.** The module doc states the file is "one home, so neither imports the other." If you add a new refusal or event, add it here rather than in one of the two service files.
- **Field errors vs. body errors.** `badRemedy` and `badStatement` use `fieldError` (tied to a request field for form display); all other 422s and every 409/403 use the flat `{ code, message }` shape.
- **`windowClosed` defaults `guarantee` to `false`.** The caller must pass `true` only for defect/wrong-item reasons; forgetting it changes the message but not the code.
- **`forbidden` is the only factory that writes a side-effect (audit) before returning a response.** No route-level guard can detect this case because the required permission depends on the order's state, so the audit call lives here.
- **Events are keyed on `orderId` (aggregateId)** to keep per-order event ordering, not on `returnId`.
