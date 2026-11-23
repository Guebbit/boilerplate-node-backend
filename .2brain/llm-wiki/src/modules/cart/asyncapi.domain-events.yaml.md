---
source: src/modules/cart/asyncapi.domain-events.yaml
source_sha256: 898abeb284b009591ef9f2f6a14da8891df4cd050a24ff423f5a48c66ce30a91
context_sha256: ddf68990b0799feac2d5de81dee77fe37d4874a5737647139eb04f9fc08e9257
generated_at: 2026-11-22T04:29:38.101996+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/asyncapi.domain-events.yaml

## Purpose
AsyncAPI fragment declaring the domain events the cart module emits. It is a backend-only fragment, not a standalone AsyncAPI document, and its header comment says it is merged into the `domain-events` section of the shared domain-events contract.

## Key elements
- **Channel `domain.cart.lines_removed`** (address `cart.lines_removed`): emitted once per product deletion, after the product is pulled from carts, and only if at least one cart held it. Payload: `CartLinesRemovedDomainEventPayload`.
- **Channel `domain.cart.merge_refused`** (address `cart.merge_refused`): emitted once per `POST /cart/merge` that had lines it couldn't add at all (product no longer publicly visible, or the cart is at its line limit and the product is new to it). One event carries all refused lines. Not emitted when no lines were refused. Lines that merely landed with a different quantity are excluded. Payload: `CartMergeRefusedDomainEventPayload`.
- **Operations** `domainCartLinesRemoved` and `domainCartMergeRefused`: both `action: send`, each bound to its channel and message.
- **Messages** `CartLinesRemovedDomainEvent`, `CartMergeRefusedDomainEvent`: titles "Cart lines removed" and "Cart merge refused".
- **Schemas** (all `additionalProperties: false`):
  - `CartLinesRemovedDomainEventPayload`: `userIds` (string[]), `productId`, `titles` (locale → name map); all required.
  - `CartMergeRefusedDomainEventPayload`: `userId`, and `lines[]` of `{ productId, requested (number), titles }`; all required.

## Relationships
- Listed as a graph neighbor of `src/modules/cart/module.ts`, the cart module that owns these events. The YAML itself contains no code references to it.

## Notes
- Both channels use `x-transport: in-process`.
- `titles` is copied into the payload because the product may be gone (deleted, or no longer visible) by the time a listener reads the event, so listeners can only quote this snapshot.
- `lines_removed` is the cart's event rather than `notifications` listening to the product deletion directly, because only the cart knows whose carts held the product.
- `requested` in `merge_refused` is the quantity the guest asked for.
