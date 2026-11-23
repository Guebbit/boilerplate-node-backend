---
source: src/modules/returns/asyncapi.domain-events.yaml
source_sha256: 7d1d20de31b951fe5ab7dc66dbf8c47c2608f6b21732003fbd4fd16cc620d24a
context_sha256: 543a991afae58df9136daf091a9a09f4e68fc87260ecac53b613baf2eb43a2cb
generated_at: 2026-11-22T07:20:22.922322+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/asyncapi.domain-events.yaml

## Purpose
AsyncAPI fragment (not a standalone document) declaring the domain events the `returns` module emits. It is merged into the `domain-events` section of the shared contracts and is backend-only. It defines channels, send operations, message wrappers and payload schemas for the return lifecycle.

## Key elements
All five channels use `x-transport: outbox`, and each has a matching `send` operation and message.

- **`domain.return.requested`** (`return.requested`, op `domainReturnRequested`): a return was opened. It is either a withdrawal (born approved, or born closed if it reached the order before dispatch) or a request awaiting staff. Payload requires `returnId`, `orderId`, `orderNumber`, `reason` (`ReturnReason`) and `requestedAt`. `statedVia` is optional and only set for withdrawals. `requestedAt` is when the buyer asked, not when the shop recorded it.
- **`domain.return.decided`** (`return.decided`, op `domainReturnDecided`): staff approved or declined a request. Payload has `returnId`, `orderId` and `decision` (`approved` | `declined`). The channel description says it is written with the decision so the customer's mail goes out exactly when a decision stood. The description ends mid-sentence ("Internal —").
- **`domain.return.received`** (`return.received`, op `domainReturnReceived`): goods arrived and went back on sale. It writes one `restock` movement per line, in the same transaction as the status move. Payload has `returnId` and `orderId`.
- **`domain.return.closed`** (`return.closed`, op `domainReturnClosed`): the return is finished and the money went back, or there was none to return. Payload requires `returnId`, `orderId`, `refundAmount` (string) and `currency`. `remedy` (`ReturnRemedy`) is optional.
- **`domain.return.closed_by_hand`** (`return.closed_by_hand`, op `domainReturnClosedByHand`): staff closed a received return manually after checking the money themselves. Payload has `returnId` and `orderId`.
- **`components.messages`**: `Return{Requested,Decided,Received,Closed,ClosedByHand}DomainEvent`. Each wraps a `…DomainEventPayload` schema in `components.schemas`.

## Relationships
- `src/modules/products/asyncapi.domain-events.yaml` has the same fragment shape, with channels, operations and components for its own module's events.
- `ReturnReason` and `ReturnRemedy` are referenced via `$ref` but not defined here. They must be resolved elsewhere, presumably in the merged document.

## Notes
- `return.closed` fires when the refund settles. That is either immediately or later, when the payment sweep completes it. A withdrawal before dispatch fires it at birth, right after `return.requested`, because the order's own cancel carries the refund.
- `return.closed_by_hand` is **not** `return.closed`. No money moves and the buyer is not mailed. It only lets `tasks` clear the to-do that asked staff to check.
- Outbox delivery is at-least-once, so listeners should dedupe on `meta.eventId`. The file states this explicitly for `closed_by_hand`.
- All payload schemas set `additionalProperties: false`.
