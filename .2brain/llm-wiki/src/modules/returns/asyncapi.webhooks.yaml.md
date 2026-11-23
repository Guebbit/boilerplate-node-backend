---
source: src/modules/returns/asyncapi.webhooks.yaml
generated_at: 2026-11-22T07:20:37.914562+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/asyncapi.webhooks.yaml

## Purpose
AsyncAPI fragment declaring the returns module's outbound webhook events: `return.requested`, `return.received` and `return.closed`. Each event is a Standard Webhooks envelope `{ type, timestamp, data }`. It is not a standalone document. It exists so the module's events appear in the webhook contract only while the module is present.

## Key elements
- **Channels** (`return.requested`, `return.received`, `return.closed`): each has an address equal to its name, `x-read-rule: read:Return`, and the `#/servers/subscriberEndpoint` server. Each links to one message.
- **Operations** (`webhookReturnRequested`, `webhookReturnReceived`, `webhookReturnClosed`): all `action: send`. Each is one-to-one with a domain event of the same name. The descriptions point to `src/modules/returns/services/create.ts`, `receive.ts` and `close.ts`.
- **Messages** (`ReturnRequestedEvent`, `ReturnReceivedEvent`, `ReturnClosedEvent`): headers are `WebhookHeaders`, and the payload is the matching envelope schema.
- **Envelope schemas** (`Return{Requested,Received,Closed}Envelope`): `type` is a single-value enum, `timestamp` is a date-time, and `data` is the payload. `additionalProperties: false`.
- **Payload schemas**:
  - `ReturnRequestedPayload`: `returnId`, `orderId`, `reason`, `requestedAt`, and optional `statedVia`.
  - `ReturnReceivedPayload`: `returnId`, `orderId`.
  - `ReturnClosedPayload`: `returnId`, `orderId`, `refundAmount`, `currency`, and optional `remedy`.

## Relationships
- **`src/modules/returns/openapi.yaml`**: payloads `$ref` `ReturnReason`, `ReturnStatementChannel` and `ReturnRemedy` from it. The bundler copies these schemas in, so the REST and event contracts share one list of codes.
- **`src/modules/payments/asyncapi.webhooks.yaml`**: a sibling fragment following the same pattern. The `return.closed` description tells consumers to follow the payments module's refund events for the money and to join them on the refund's `returnId`.
- **`src/modules/returns/authorization.yaml`**: not referenced in the file's contents. The `x-read-rule: read:Return` value is presumably a rule defined there, but the file doesn't say.

## Notes
- The file refs `#/servers/subscriberEndpoint` and schemas such as `WebhookHeaders`, `Id`, `NonNegativeDecimalAmount` and `CurrencyCode`, which are not defined here. Per the file's header comment, `WebhookHeaders` and the server come from the top-level webhooks AsyncAPI document the fragment is merged into.
- The bundler (`scripts/contracts/asyncapi-section-fragments.ts`) merges this fragment into `webhooks` only while the module exists. `GET /webhooks/events` lists these events only while the module is registered.
- The module's `publicEvents` in `module.ts` is what actually fires each event.
- A withdrawal before dispatch fires `return.requested` and then immediately `return.closed`. The return is born closed, and the money may still be owed.
- `return.closed` is not fired when a refund could not be opened (the payment had nothing left). The return stays `received` until staff close it by hand.
- `refundAmount` is the total the customer gets back for the return. The payment refund can be smaller if part of the payment already went back another way.
