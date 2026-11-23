---
source: src/modules/payments/asyncapi.webhooks.yaml
generated_at: 2026-11-22T06:40:10.478373+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/asyncapi.webhooks.yaml

## Purpose
AsyncAPI fragment declaring the payments module's outbound webhook events (`payment.*`). It is not a standalone document: it references `#/servers/subscriberEndpoint` and `#/components/schemas/WebhookHeaders`, which are declared in `src/modules/webhooks/asyncapi.yaml`. The bundler (`scripts/contracts/asyncapi-section-fragments.ts`) merges it into the `webhooks` section only while the payments module exists, and `GET /webhooks/events` lists these events only while the module is registered. Each event uses the Standard Webhooks envelope `{ type, timestamp, data }`. The module's `publicEvents` (`module.ts`) is what actually fires them.

## Key elements
- **Channels** (all with `x-read-rule: display:Payment` and the `subscriberEndpoint` server):
  - `payment.succeeded`: a payment settled.
  - `payment.failed`: an attempt was declined.
  - `payment.refunded`: a full or partial refund settled.
  - `payment.refund_failed`: the provider refused a refund or reported one failed.
  - `payment.refund_reversed`: the provider took back a settled refund.
  - `payment.dispute_opened`: the buyer's bank disputed a card payment.
  - `payment.dispute_updated`: a dispute changed (evidence sent, decided, reopened).
- **Operations** (all `action: send`): `webhookPaymentSucceeded`, `webhookPaymentFailed`, `webhookPaymentRefunded`, `webhookPaymentRefundFailed`, `webhookPaymentRefundReversed`, `webhookPaymentDisputeOpened`, `webhookPaymentDisputeUpdated`. Each is described as one-to-one with the same-named domain event (`src/modules/payments/events.ts`).
- **Messages** (`components.messages`): one `Payment…Event` per channel, using `WebhookHeaders` as headers and a `Payment…Envelope` schema as payload.
- **Schemas** (`components.schemas`), as far as visible:
  - `PaymentEventPayload`: `paymentId` and `orderId`.
  - `PaymentRefundedPayload`: adds `refundId`, `amount`, `currency`.
  - `PaymentRefundReversedPayload`: the same, plus `failureReason`.
  - `PaymentRefundFailedPayload`: starts with `paymentId`, `orderId` and `refund`.
  - All use `additionalProperties: false`.

## Relationships
- `src/modules/payments/openapi.yaml`: `failureReason` in `PaymentRefundReversedPayload` refs `./openapi.yaml#/components/schemas/RefundFailureReason`, which resolves to this neighbor. The bundler copies the schema in, so the REST and event contracts share one list of codes.
- `src/modules/payments/authorization.yaml`: the `x-read-rule: display:Payment` values on the channels name a read rule. This page does not show how that file defines it.
- `src/modules/returns/asyncapi.webhooks.yaml`: a sibling fragment for another module that follows the same fragment pattern. No direct reference is visible.
- `src/modules/shop-tasks/openapi.notifications.yaml`: no direct interaction is visible in this file.

## Notes
- Deleting the payments module removes these events from the contract.
- `payment.failed` can fire more than once per order, because a payment is retryable with another method.
- `payment.refunded` fires once per refund (by `refundId`).
  - Sources: an operator request, a cancel, the retry sweep, or a refund imported from the provider's dashboard.
  - It does not fire while a hand-paid refund waits for operator confirmation.
  - It may fire again for the same `refundId` after a `payment.refund_reversed`, once an operator marks the refund returned.
- `payment.refund_failed` fires once per new refusal (the first, or a changed reason), not on every retry. `final` says whether retrying has ended.
- `payment.refund_reversed`: the refund is owed again by another way. The credit note issued when it settled stays.
- `payment.dispute_opened` fires once per dispute. No refund or credit note follows, and the shop answers in the provider's dashboard before `evidenceDueBy`.
- `payment.dispute_updated` fires for each newer report of a known dispute. Older or repeated reports are dropped.
