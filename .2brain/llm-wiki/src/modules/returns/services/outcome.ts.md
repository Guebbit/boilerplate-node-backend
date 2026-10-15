---
source: src/modules/returns/services/outcome.ts
sha256: c7a0b3a2e5333e5cf9f8bfd56dee3169beb303a99c89741f9d4101ef50f70c7f
generated_at: 2026-10-15T11:57:20.032747+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/outcome.ts

## Purpose

Defines the shared outcome type, refusal helpers, and write helpers (outbox event, audit) that both return-opening flows — `create.ts` (goods coming back) and `cancel-remainder.ts` (cancelling an unshipped remainder) — return and record. Centralizing these here lets each service import this file instead of the other.

## Key elements

- **`CreateReturnInput`** — interface for the customer-facing payload: `orderId`, `reason`, optional `kind` (`'return'` | `'cancellation'`), `fulfillmentOrderId`, `note`, and `lines`.
- **`CreateReturnOutcome`** — discriminated union (`refused` | `created`) that every opening flow returns to its caller.
- **`refused(reject)`** — wraps a `ResponseReject` into a `CreateReturnOutcome`.
- **`notReturnable()`** — 409 `RETURN_ORDER_NOT_RETURNABLE`.
- **`windowClosed()`** — 409 `RETURN_WINDOW_CLOSED`.
- **`badLines(reason)`** — 422 `RETURN_LINES_INVALID`; the `reason` param (`'nothing-returnable'` | `'unknown-product'` | `'too-many'` | `'excluded'`) selects the i18n message.
- **`badCancellation()`** — 422 `RETURN_CANCELLATION_INVALID`.
- **`nothingToCancel()`** — 409 `RETURN_NOTHING_TO_CANCEL`.
- **`enqueueRequested(created, session)`** — writes a `RETURN_REQUESTED` outbox event inside the creating transaction, keyed on `orderId` for per-order ordering.
- **`recordOpened(order, created, context)`** — writes the audit row (`returnsAuditActions.RETURN_REQUESTED`, outcome `success`) for a just-created return.

## Relationships

- **`src/infrastructure/http/response.ts`** — provides `generateReject` and the `ResponseReject` type used by every refusal helper.
- **`src/infrastructure/i18n/index.ts`** (via `t`) — all customer-facing messages are i18n keys.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` is called by `recordOpened`.
- **`src/kernel/outbox.ts`** — `enqueueOutboxEvent` is called by `enqueueRequested`.
- **`src/modules/orders/index.ts`** — source of the `OrderDocument` type passed to `recordOpened`.
- **`src/modules/returns/model.ts`** — source of the `ReturnDocument` type used throughout.
- **`src/modules/returns/audit.ts`** — provides `returnsAuditActions` enum values for the audit record.
- **`src/modules/returns/events.ts`** — provides the `RETURN_REQUESTED` event name.
- **`src/modules/returns/domain/index.ts`** — provides `ReturnReason` and `ProductQuantity` types used in `CreateReturnInput`.
- **`src/types/auth-context.ts`** — provides `CallerContext` for audit and `ReturnKind` for the input shape.
- **`src/modules/returns/services/create.ts`** / **`cancel-remainder.ts`** — the two consumers that import these helpers and return `CreateReturnOutcome` to their handlers.

## Notes

- The file exists explicitly so `create.ts` and `cancel-remainder.ts` never import each other.
- `enqueueRequested` keys the outbox entry on `orderId` (not `returnId`) to guarantee ordering of all events for a single order.
- `lines` in `CreateReturnInput` is mutually exclusive with `kind: 'cancellation'`; the `badCancellation()` helper covers the violation.
