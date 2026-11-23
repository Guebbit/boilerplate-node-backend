---
source: src/modules/payments/services/announce.ts
source_sha256: 73097ab29624e2e7980c9f8d16d9d61884033824cdeb8cf30ca0736963a9b577
context_sha256: e0e21399798c7cf93c0d80dd74f101bb818a35e389d85b05df143fb198b01ace
generated_at: 2026-11-22T06:49:11.772790+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/services/announce.ts

## Purpose
Records a declined payment and announces it. The `declined` status change, the order timeline entry, and the `PAYMENT_FAILED` outbox event are written in one transaction, so a decline that lands is always announced and one that loses its race never is. The success counterpart (`PAYMENT_SUCCEEDED`) lives in `./settlement.ts`.

## Key elements
- `recordDecline(orderId, extra, newAttempt = false)`: the only export.
  - Calls `announceInTransaction` from `@kernel/outbox`.
  - Inside the transaction, the payment repository moves the payment to `declined` and applies `extra` (e.g. the card's last four digits).
  - If the update moved the payment, it appends a `payment_declined` timeline row (`{ paymentId }` only, with no provider wording) through the orders module.
  - It then emits a `PAYMENT_FAILED` event with payload `{ paymentId, orderId }` and `aggregateId: orderId`.
  - Returns the updated `PaymentDocument`, or `null` if this call did not move the payment.

## Relationships
- `src/kernel/outbox.ts`: provides `announceInTransaction`, which runs the callback with a session and builds the event from its result.
- `src/modules/orders/index.ts`: supplies the orders service used to append the timeline row, called with the same session.
- `src/modules/payments/repository.ts`: supplies the payment repository that performs the conditional status write.
- `src/modules/payments/domain/index.ts`: supplies `SETTLEABLE_PAYMENT_STATUSES`, the allowed source statuses.
- `src/modules/payments/events.ts`: supplies the `PAYMENT_FAILED` event name.
- `src/modules/payments/model.ts`: supplies the `PaymentDocument` type.
- `src/modules/payments/services/settlement.ts`: the sibling that writes `PAYMENT_SUCCEEDED` inside its own transaction.
- `src/modules/payments/tests/integration/announce.test.ts` (and `timeline.test.ts`): integration tests for this behavior.

## Notes
- `newAttempt` decides whether an already-`declined` payment can be declined again:
  - `true`: a confirm, which is itself an attempt, so a second declined card counts as a new decline. `declined` stays in the allowed source statuses.
  - `false` (default): a passive report such as a webhook or sync. `declined` is filtered out of the allowed statuses, so a repeat is a no-op returning `null`. This covers Stripe sending two events for one decline, and polls that repeat it.
- A `null` return means no timeline row and no event were written. This keeps redelivered declines from telling `webhooks` the attempt happened twice.
