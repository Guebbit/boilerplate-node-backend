---
source: src/modules/payments/asyncapi.domain-events.yaml
generated_at: 2026-11-22T06:39:52.918737+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/asyncapi.domain-events.yaml

## Purpose
AsyncAPI fragment declaring the domain events the payments module emits. It is merged into the `domain-events` section of the shared contract and is not a standalone document. It gives listeners (invoicing, tasks, webhooks) a contract for each payment fact.

## Key elements
All channels use `x-transport: outbox` and each references a message under `#/components/messages/`. The `domain.payment.*` channels, with their addresses:

- `succeeded` (`payment.succeeded`): a payment settled. It is emitted alongside `order.status_changed` (`to: 'paid'`) from the same at-most-once write. `webhooks` is the first listener that needs it.
- `failed`: the provider declined the method. It is retryable with another method, so it can fire more than once per order.
- `refunded`: one refund settled, from `settleRefund`. It can fire more than once per payment. `amount` is this refund's, and `full` marks a refund of the whole payment. `invoicing` issues a credit note from it. It is absent while a hand-paid refund waits for an operator.
- `refund_canceled`: staff voided a refund (`cancelRefund`). No money moved and the share is refundable again.
- `refund_failed`: the provider refused a refund. `final` says whether retrying ends. It is emitted once per new refusal (first, or a changed reason). `failureReason` is a closed code.
- `refund_reversed`: the provider took back a settled refund. The record reopens and is owed another way. A later `payment.refunded` fires for the same `refundId`.
- `dispute_opened` and `dispute_updated`: the card dispute lifecycle. A dispute does not change the order and is not a refund. `evidenceDueBy` is the deadline for the shop's answer.
- `refund_owed_after_dispute`: a dispute ended and a refund refused as `disputed` is owed again. One event is raised per refund. Its flags are `bankKept`, `otherCurrency`, `markedReturned` and `followsFlip`.
- `refund_owed_by_hand`: a refund of a hand-recorded payment is owed outside the app (cash, transfer).
- `amount_mismatch`: the provider reported a success that does not match the frozen payment. The order was canceled and a refund opened.
- `refund_unrecorded`: a refund made in the provider's dashboard could not be imported (`lost_race` or `other_currency`). "Re-sync refunds" (`POST /payments/{id}/refunds/sync`) reruns the import.
- `return_refund_short`: a return asked for more money than the payment could give back (`opened` can be `0.00`).

An `operations` section follows the channels. In the visible part, each operation uses `action: send` and references its channel, for example `domainPaymentSucceeded` and `domainPaymentFailed`.

## Relationships
- `src/modules/orders/asyncapi.domain-events.yaml` and `src/modules/inventory/asyncapi.domain-events.yaml` are sibling fragments that, like this one, contribute to the same `domain-events` section. The orders module owns the `order.status_changed` event that is emitted together with `payment.succeeded`.
- `src/modules/invoicing/module.ts` is the module behind the credit-note behavior described for the `refunded` event.
- `src/modules/tasks/module.ts` is the module behind the staff to-dos or attention rows. These open on `dispute_opened`, `refund_owed_after_dispute`, `refund_unrecorded` and `return_refund_short`. They close on `refund_canceled`.

## Notes
- Delivery is at-least-once through the transactional outbox, so listeners must dedupe on `meta.eventId`.
- `payment.succeeded` can arrive after the settlement's response. If a settlement died after charging, it can arrive minutes later.
- Events are emitted in the same transaction as the state change they describe. This is why redeliveries or crashes do not duplicate to-dos.
- `refund_failed` stays silent when a retry fails the same way.
- `dispute_updated` announces nothing for a repeated or older report.
