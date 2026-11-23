---
source: src/modules/orders/asyncapi.webhooks.yaml
source_sha256: a3b06bec625626631ff68d86540220ef12c61627e11f84c14524e939979599ec
context_sha256: cec60a001b6cbd72eef1f3748b31a687cae9195f94d1c866ffea5d86b8816196
generated_at: 2026-11-22T06:07:31.154015+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/asyncapi.webhooks.yaml

## Purpose
AsyncAPI **fragment** declaring the orders module's outbound webhook events (`order.created`, `order.paid`, `order.canceled`, `order.redacted`). It is not a standalone document. It refs `#/servers/subscriberEndpoint` and `#/components/schemas/WebhookHeaders`, both declared by `src/modules/webhooks/asyncapi.yaml`. The file exists so the orders events join the webhook contract only while the module exists.

## Key elements
- **`channels`**: four channels, one per event. Each has `address` equal to its name, `x-read-rule: display:Order`, a description, the `subscriberEndpoint` server, and one message.
- **`operations`**: `webhookOrderCreated`, `webhookOrderPaid`, `webhookOrderCanceled` and `webhookOrderRedacted`, all `action: send`. Their descriptions record when each event fires:
  - `created`: once per order, from both admin create and storefront checkout (`recordCreated` in `src/modules/orders/services/crud.ts`).
  - `paid`: derived from the `order.status_changed` event with `to: 'paid'`, not from its own domain event.
  - `canceled`: the `order.canceled` domain event without its refund policy. Refund money movement is signalled by `payment.refunded`.
  - `redacted`: fired by the nightly `reap:orders` retention sweep, in the scrub's transaction. It is not fired at erasure itself.
- **`components.messages`**: `OrderCreatedEvent`, `OrderPaidEvent`, `OrderCanceledEvent` and `OrderRedactedEvent`. Each uses the `WebhookHeaders` schema for headers and its own envelope schema for the payload.
- **`components.schemas`**:
  - `OrderIdPayload`: `{ orderId }`, referencing the shared `Id` schema. It is the `data` for created, paid and redacted.
  - `OrderCanceledPayload`: `{ orderId, cause }`. `cause` is the enum `customer`, `operator`, `withdrawal`, `reservation_expired`, `erasure`, `payment_mismatch`, `lost`.
  - `Order{Created,Paid,Canceled,Redacted}Envelope`: the Standard Webhooks envelope `{ type, timestamp, data }`. `type` is a single-value enum and `timestamp` is `date-time`. All use `additionalProperties: false`.

## Relationships
- **`src/modules/webhooks/module.ts`**: the header comment says `GET /webhooks/events` lists these events only while the orders module is registered, and that the orders module's `publicEvents` (in its own `module.ts`) is what actually fires them.
- **`src/modules/orders/asyncapi.domain-events.yaml`**: sibling spec for the orders domain events. The operation descriptions refer to the underlying domain events, and the webhook contracts here are derived from them.

## Notes
- Each envelope's `type` carries an explicit `title` (for example `OrderCreatedEventType`) so Modelina generates a stable model name. Otherwise it becomes an `AnonymousSchemaN` that is renumbered whenever unrelated schemas are added. Keep the titles when adding events.
- A bundler script merges this fragment into the `webhooks` section only while the orders module exists.
- The cancel `cause` enum has the title `OrderCancelCause`. A `lost` cancel does not restock its units.
- `order.redacted` tells recipients to drop the buyer's email, addresses and notes for `orderId`. The order row itself is kept as the invoice.
- Payloads carry only identifiers (plus `cause` for cancels), not order details.
