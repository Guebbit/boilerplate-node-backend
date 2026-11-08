---
source: src/modules/returns/services/close.ts
sha256: b66d6ab9586823ec8431930119a89a7a91837a10b166c9e52cca8c8da00632c0
generated_at: 2026-11-08T08:02:44.473727+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/close.ts

## Purpose

Handles the `received → closed` status transition for a return. Exposes two public entry points: an automatic close (triggered in-request after a refund settles, or later by the `PAYMENT_REFUNDED` outbox listener) and a manual staff close for refunds that never flow through the payment provider. Both share an idempotent claim so that whichever path arrives second is a no-op.

## Key elements

- **`closeReturn(id, actor?)`** (exported) — Automatic close. Runs `claimClosed` inside `announceInTransaction` so the `returnClosedEvent` outbox row is written atomically with the status flip. Then calls `syncReturnStatus` to refresh the order's projected return status. Returns `null` if the return was not in a closable state (already closed or never received).
- **`closeReturnByHand(id, note, context)`** (exported) — Staff-initiated close for non-standard refunds (canceled, paid out-of-band). Uses `withTransaction` directly, does **not** announce `returnClosedEvent` (the associated email would falsely claim a refund was made). Records an audit entry (`ADMIN_RETURN_CLOSED`) and returns a `200` success or a `404`/`409` rejection.
- **`claimClosed(id, actor, session)`** (private) — The shared conditional write: `returnRepository.claimStatus` flips the status only if it is in `CLOSABLE_RETURN_STATUSES`, then appends a `return_closed` row to the order timeline via `orderService.appendTimeline`. Returns `null` on a lost race.
- **`notClosable(id)`** (private) — Distinguishes "return not found" (404) from "return exists but is not `received`" (409) for the hand-close path.

## Relationships

- **`src/modules/returns/repository.ts`** — `returnRepository.claimStatus` performs the conditional status flip; `findById` supports the 404 vs 409 distinction.
- **`src/modules/returns/domain/index.ts`** — Supplies `CLOSABLE_RETURN_STATUSES`, the set of statuses from which a close is legal.
- **`src/modules/returns/model.ts`** — `ReturnDocument` type used throughout.
- **`src/modules/returns/audit.ts`** — `returnsAuditActions.ADMIN_RETURN_CLOSED` action name for the hand-close audit record.
- **`src/modules/returns/module.ts`** — Its `PAYMENT_REFUNDED` outbox listener calls `closeReturn` when the provider finally settles a previously refused refund.
- **`src/modules/orders/index.ts` / `src/modules/orders/services/index.ts`** — `orderService.appendTimeline` writes the order-timeline row; `syncReturnStatus` (from `./projection`, not a listed neighbor) refreshes the order's projected status.
- **`src/kernel/outbox.ts`** — `announceInTransaction` wraps `claimClosed` so the event row and status change commit atomically.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` provides the session for the hand-close path.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` logs the staff hand-close.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape the API responses.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — `t()` localizes error messages (`returns.not-closable`, `returns.not-found`).
- **`src/domain-primitives/money.ts`** — `padDecimal` normalises the refund amount for the timeline row.

## Notes

- `closeReturn` is deliberately stateless regarding *why* the close is happening: it checks only the return's status, never that a refund actually settled. The "money went back" fact is owned by its callers (`receiveReturn`, the `PAYMENT_REFUNDED` listener).
- The idempotency guarantee comes from `claimStatus` being a conditional write; the second caller simply gets `null` and does nothing. No locking or retry logic is needed.
- `closeReturnByHand` intentionally skips the outbox announcement because `returnClosedEvent`'s email tells the customer their money was returned—false in the hand-close scenario. The only record of the close in that path is the audit row and the order timeline entry.
