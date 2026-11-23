---
source: src/modules/shop-tasks/services/tasks.ts
source_sha256: f169343fb8771bbef101ce277e1888b3677ec4ce179295e6f4056d79a10adb63
context_sha256: 5076bf2dd59e2db71392f523935448d2909c68598385400ac8bfc1f14c635cc4
generated_at: 2026-11-22T07:43:36.103511+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/services/tasks.ts

## Purpose
Maps payment, stock and delivery domain events to staff to-dos for the shop. Each event opens (or touches) one task per situation, and the event that ends the situation clears it. The tasks engine (`taskService.openSystemTask` / `clearSystemTasks`) does the writing and dedup. This file only decides which event is which situation and which staff screen does the work.

## Key elements
- `shopTasks`: exported object of event handlers, which `module.ts` subscribes.
  - `onRefundOwedByHand`: opens a `refundOwedOpening` task for `payment.refund_owed_by_hand`, linked to the payments attention tab.
  - `onRefundFailed`: for `payment.refund_failed`, acts only when `payload.final` is true. It skips opening a task if an open dispute's to-do already carries the refund (`disputeTaskCarries`). Otherwise it opens `refundRefusedOpening`, due at the legal deadline or the attention window.
  - `onRefundReversed`: for `payment.refund_reversed`, uses the same dispute check and due-date logic as `onRefundFailed`, and opens `refundReversedOpening`.
  - `onRefundClosed`: clears the `manual_refund_owed`, `refund_refused` and `refund_reversed` tasks linked to the refund id. It serves `payment.refunded` and `payment.refund_canceled`.
  - `onAmountMismatch`: opens `amountMismatchOpening`, linked to the plain sales-payments page.
  - `onRefundUnrecorded`: opens `refundUnrecordedOpening`, linked to the payments attention tab.
  - `onReturnRefundShort`: opens `returnRefundShortOpening`, linked to the return's staff page.
  - `onReturnClosedByHand`: clears `return_refund_short` tasks for the return.
  - `onDispute`: handles `payment.dispute_opened` and `payment.dispute_updated`, with one to-do per stage. A `needs_response` status opens `disputeOpening`. The rest of the handler is beyond what is visible here.
- `open`: private helper that adds the `work` link to an opening and calls `taskService.openSystemTask`.
- `guarded`: logs a handler's failure with `logger.error`, then rethrows so the outbox redelivers.
- `attentionDueAt`: now plus `paymentAttentionMinutes()`, the due date for situations without a legal clock.
- `afterDisputeDueAt`: due date for a refund the dispute held back. It is never already past: the legal deadline is used only if it is still ahead and sooner than the attention window.
- `disputeTaskCarries`: true only when the failure reason is `disputed` and `paymentService.disputeStanding` reports an open dispute.
- `disputeEndedNote`: builds the closing note for a dispute's task. It adds a warning when `paymentService.keptInOtherCurrencyOn` reports money kept in a different currency than the payment's.
- `legalDeadlineOf`: converts a refund's `RefundDue` into `{ rule, day }`, with the day taken in the shop's timezone.
- `orderWork`, `PAYMENTS_ATTENTION_WORK`: build the staff-screen links.

## Relationships
- **`../domain/openings`**: supplies the pure `*Opening` builders (`refundOwedOpening`, `disputeOpening`, and others) and the `ShopOpening` and `LegalDeadline` types. This file feeds them payloads and due dates.
- **`@modules/tasks`**: `taskService` does the actual open and clear operations.
- **`@modules/payments`**: `paymentService` (`disputeStanding`, `refundLegalDue`, `keptInOtherCurrencyOn`), `paymentAttentionMinutes` and the `RefundDue` type.
- **`@modules/shop`**: `shopTimezone()` and `shopCountry` (imported; the visible part only uses the timezone).
- **`@infrastructure/http/frontend-link`**: `FRONTEND_LINK_RULES` and `fillPath` build the staff-screen links.
- **`@infrastructure/adapters/logger`**: error logging in `guarded`.
- **`@kernel/events`**: `DomainEventMap` and `DomainEventMeta` type the payloads and delivery metadata.
- **`@domain-primitives/time`**: `MINUTE_MS` and `dayInZone`.

## Notes
- Handlers pass `meta` through to the tasks engine. Its `eventId` makes a redelivered event a no-op.
- `guarded` rethrows after logging, because a missed open is a lost task and the outbox must redeliver.
- A `disputed` refund failure or reversal is left to the dispute to-do while a dispute is open. With none open, the refund opens its own task.
- `onRefundUnrecorded` and `onAmountMismatch` are closed by staff. No event clears them.
- `onReturnRefundShort` keeps its original figures, since there is one open to-do per return.
