---
source: src/modules/stock-alerts/asyncapi.domain-events.yaml
source_sha256: a3d49a83205eb410953a6f191f07f7eb44218a4f4881e7822f1cf0b9527412b9
context_sha256: 543a991afae58df9136daf091a9a09f4e68fc87260ecac53b613baf2eb43a2cb
generated_at: 2026-11-22T07:53:22.416401+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/asyncapi.domain-events.yaml

## Purpose
AsyncAPI fragment declaring the domain events the stock-alerts module emits. Per its header comment, it is merged into the `domain-events` section (`shared/contracts/asyncapi.domain-events.yaml`), is backend-only, and is not a standalone document. It currently defines one event: a buyer who asked to be notified about a product was notified.

## Key elements
- **Channel `domain.stock_alert.sent`**: address `stock_alert.sent`, `x-transport: outbox`. The event goes through the outbox in the same transaction that deletes the alert request. So the inbox row exists exactly when the request does not.
- **Operation `domainStockAlertSent`**: `action: send` on that channel, referencing the `StockAlertSentDomainEvent` message.
- **Message `StockAlertSentDomainEvent`** (title "Stock alert sent"): its payload is `StockAlertSentDomainEventPayload`.
- **Schema `StockAlertSentDomainEventPayload`**: an object with `additionalProperties: false` and all three fields required:
  - `userId` (string)
  - `productId` (string)
  - `titles` (object mapping locale to string, i.e. the product's name by locale)

## Relationships
- `src/modules/products/asyncapi.domain-events.yaml` is a sibling fragment. Both are merged into the same shared `domain-events` contract. Nothing in this file references it directly.

## Notes
- `titles` is carried in the payload so the notification row can name the product even after the product is deleted.
- It is a fragment: the `$ref`s (`#/components/...`, `#/channels/...`) resolve only once merged into the full document.
- The description says the mail is queued by the time the event is sent.
