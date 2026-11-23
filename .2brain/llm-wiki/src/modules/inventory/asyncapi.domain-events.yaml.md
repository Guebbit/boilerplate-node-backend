---
source: src/modules/inventory/asyncapi.domain-events.yaml
source_sha256: 153565c749b29d7bf67772a7068ccf1d36d39281b79828571ca6fc4574d07120
context_sha256: f2b87ec625b06494d8e191339e4465e01b5922c6f7fa90baf6c2eef1a9f1bfef
generated_at: 2026-11-22T05:15:49.286632+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/inventory/asyncapi.domain-events.yaml

## Purpose
An AsyncAPI fragment (not a full document) declaring the domain events the inventory module emits. Its header comment says it is merged into the `domain-events` section of `shared/contracts/asyncapi.domain-events.yaml` and is backend-only. It defines the channels, send operations, messages and payload schemas for four events, all using the `outbox` transport.

## Key elements
All channel addresses are the channel key minus the `domain.` prefix, such as `inventory.reservation_expired`. Each event has a `send` operation and a message component, and every payload is an object with `additionalProperties: false`.

- **`domain.inventory.reservation_expired`** (operation `domainInventoryReservationExpired`): a hold's window closed before payment, and its units were already released. It is emitted after the release. The `orders` listener cancels the order. Payload: `orderId`.
- **`domain.inventory.backorder_allocated`** (`domainInventoryBackorderAllocated`): stock arrived for a paid preorder, and some preorder units of one product became real set-aside units. It is written through the outbox in the receipt's own transaction. Payload: `orderId`, `productId`, `waiting` (number).
- **`domain.inventory.stock_retaken`** (`domainInventoryStockRetaken`): a payment landed on a hold that had been released, and its units were taken again inside the payment's transaction. The module refreshes the catalogue's stock copy in response. Payload: `orderId`, `productIds` (string array).
- **`domain.inventory.hold_orphaned`** (`domainInventoryHoldOrphaned`): an order was paid and nothing was set aside for it. Either the hold never existed, or it was given up and the shelf could not cover it again. It is written in the payment's own transaction. `tasks` opens work from it and closes that work when the order is canceled or ships. Payload: `orderId`.
- **`components.messages` / `components.schemas`**: `Inventory…DomainEvent` messages, each with a `…DomainEventPayload` schema.

## Relationships
- `src/modules/orders/module.ts`: the `reservation_expired` description names `orders` as the listener that cancels the order. No other link to this file is visible in the content.
- `src/modules/inventory/module.yaml` and `src/modules/payments/asyncapi.domain-events.yaml`: the file content does not reference either directly. The payments file is presumably a sibling fragment for the same shared `domain-events` section. The `stock_retaken` and `hold_orphaned` descriptions refer to events occurring in a payment's transaction.

## Notes
- `waiting` in `backorder_allocated` is a state, not a delta: it is what is still a preorder claim for that order and product after the allocation. This makes redelivery harmless, because `delivery` releases whatever it holds beyond `waiting`. `0` means all of the order's preorder units of that product are covered.
- `stock_retaken` redelivery is also harmless, because the handler only re-reads.
- `reservation_expired` uses the past tense deliberately, because the event is emitted after the release.
- Some operation message `$ref` strings are split across lines with `\` continuations inside double-quoted YAML. Keep the resulting pointer intact when editing.
