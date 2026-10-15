---
source: src/modules/returns/services/close.ts
sha256: a3d4cd54121d59c0617de544426d3ecfbc85b1398b8625f14d3cebbcf2204ed8
generated_at: 2026-10-15T11:55:48.800404+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/close.ts

## Purpose

Transitions a return from `received` to `closed` after its refund has settled. Because the refund can complete synchronously (same request) or asynchronously (provider retry via the `PAYMENT_REFUNDED` listener), two different call sites reach this function; the conditional `claimStatus` move makes it idempotent so the second arrival is a no-op.

## Key elements

- **`closeReturn(id: string): Promise<ReturnDocument | null>`** — sole export. Within one transaction it (1) atomically claims the status move to `closed` and stamps `closedAt`, (2) appends a `return_closed` entry to the order's timeline, and (3) emits the `RETURN_CLOSED` event via the outbox. After commit it syncs the return projection and emails the customer a "return closed" notice. Returns `null` when the return was not in a closable status (already closed or never received).

## Relationships

- **`src/kernel/outbox.ts`** — `announceInTransaction` wraps the repository write and the `RETURN_CLOSED` event in a single database transaction, guaranteeing the event exists iff the close succeeded.
- **`src/modules/orders/index.ts` / `services/index.ts`** — `orderService.appendTimeline` records the close on the order; `orderService.getById` fetches the order (needed to address the customer) before sending the mail.
- **`src/modules/returns/repository.ts`** — `returnRepository.claimStatus` performs the conditional `received → closed` move; it is the concurrency guard that makes double-calling safe.
- **`src/modules/returns/domain/lifecycle.ts` (via `domain/index.ts`)** — supplies `CLOSABLE_RETURN_STATUSES`, the set of statuses eligible for the close transition.
- **`src/modules/returns/events.ts`** — provides the `RETURN_CLOSED` event name used in the outbox payload.
- **`src/modules/returns/model.ts`** — `ReturnDocument` type returned to callers.
- **`src/modules/returns/services/notify.ts`** — `mailReturnNotice` sends the customer-facing email after the transaction commits.
- **`src/modules/returns/services/projection.ts`** — `syncReturnStatus` refreshes the read-model/projection for the order after the write.
- **`src/modules/returns/services/receive.ts`** — calls `closeReturn` when a refund settles in the same request.
- **`src/modules/returns/module.ts`** — its `PAYMENT_REFUNDED` listener calls `closeReturn` when an earlier-rejected refund later succeeds.
- **`src/modules/returns/tests/integration/outbox.test.ts`** — integration test exercising the outbox emission path of this service.

## Notes

- **Idempotency by design:** `claimStatus` filters on `CLOSABLE_RETURN_STATUSES`; if the return is already `closed` (or was never `received`), the claim returns `null` and no event, timeline row, or mail is produced. The two known callers (`receive.ts` and the `PAYMENT_REFUNDED` listener) can therefore fire in any order without double-acting.
- **Post-commit side effects are best-effort:** `syncReturnStatus`, `orderService.getById`, and `mailReturnNotice` run *after* the transaction. A failure there does not roll back the close; the return is already `closed` in the database.
- **`refundAmount` is nullable** on `ReturnDocument`; both the timeline entry and the event payload default it to `0` via `?? 0`.
- The event's `aggregateId` is the **order** id (not the return id), consistent with the event being consumed by order-scoped subscribers.
