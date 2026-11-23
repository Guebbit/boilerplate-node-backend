---
source: src/modules/products/asyncapi.domain-events.yaml
source_sha256: 556fe526a7b05efa10f0cd5766aa04bb4e8291f0178f5fa20deadc73b0e74fee
context_sha256: 5ba3d546d92c4d70141db4dede4b68e2e1550621daefe9541fddd5dada830984
generated_at: 2026-11-22T07:06:57.809712+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/asyncapi.domain-events.yaml

## Purpose
AsyncAPI fragment (not a full document) declaring the domain events the products module emits. It is merged into the backend-only `domain-events` section (`shared/contracts/asyncapi.domain-events.yaml`). Every channel uses the `outbox` transport, so events are written in the same transaction as the change that causes them.

## Key elements
Each event has a channel, a `send` operation and a message with a payload schema. All payloads set `additionalProperties: false`.

- **`domain.product.deleted`** (`product.deleted`, operation `domainProductDeleted`): fired on soft or hard delete. It is the only catalogue event that pulls cart and wishlist lines. Hiding a product or taking it off sale emits nothing, and a restore does not undo the delete's effects. Payload: `productId`, `hardDelete` (boolean), `titles` (language → name map, read before a hard delete drops the translation rows). `inventory` deletes the level row only when `hardDelete` is `true`. Listeners must be idempotent on `meta.eventId`, because the outbox redelivers until every listener has handled the event.
- **`domain.product.created`** (`product.created`, `domainProductCreated`): the product document is written with `onHand: 0`. `inventory` is the sole listener and opens the stock level at zero. Stock never rides this event; units enter through `POST /inventory/levels/{productId}/receive`. It is never emitted on update. Payload: `productId`.
- **`domain.product.release_date_changed`** (`product.release_date_changed`, `domainProductReleaseDateChanged`): `releaseDate` moved, was set or was cleared. `delivery` listens and decides, per waiting fulfillment order, whether the buyer needs a notice and whether silence now means cancel. Payload: `productId`, optional `from` and `to` (ISO 8601 strings). `from` is absent for a first date and `to` for a cleared one.
- **`domain.product.restock_date_changed`** (`product.restock_date_changed`, `domainProductRestockDateChanged`): the same shape as the release-date event, for the owed units of an already released product. `delivery` decides per waiting fulfillment order what buyers are owed.
- **`domain.product.terms_changed`** (`product.terms_changed`, `domainProductTermsChanged`): fired when `purchasable`, `allowBackorder`, `active`, `releaseDate` or `restockDate` changes, or when a product is restored from a soft delete. `inventory` listens and deletes its one-minute availability cache key. The payload carries only `productId`.

## Relationships
- Sibling fragments `src/modules/returns/asyncapi.domain-events.yaml`, `src/modules/stock-alerts/asyncapi.domain-events.yaml` and `src/modules/tasks/asyncapi.domain-events.yaml` follow the same per-module pattern. They are merged into the same `domain-events` section, but this file does not reference them.
- Consumers named in the descriptions are the `inventory` module (created, deleted, terms_changed), `delivery` (release and restock date changes) and `notifications` (a later message quotes `titles`).
- `inventory` already imports the products module, so the products module cannot import back into it without a cycle. That is why the created event is the hand-off.

## Notes
- Operation `messages` refs point at `#/channels/<channel>/messages/<Name>`, which in turn refs `#/components/messages/...`. These refs resolve only after the fragment is merged.
- `releaseDate` and `restockDate` changes can emit two events: their own and `terms_changed`. The file does not say how the two are coordinated.
- Date-changed events only fire when the date actually changes. The edit and the event commit together, so one exists exactly when the other does.
