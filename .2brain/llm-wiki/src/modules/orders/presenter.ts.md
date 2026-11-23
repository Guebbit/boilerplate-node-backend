---
source: src/modules/orders/presenter.ts
source_sha256: eec5293c801f2ad53b623f3ffed27492f5fdd1a28d0d9e8e95fdefa36079b592
context_sha256: c1b520abef8ed56e65e93fd857ef62f56ae9e3359bd37da14bc74bb50a955995
generated_at: 2026-11-22T06:16:59.770410+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/presenter.ts

## Purpose
Converts stored order data into the wire contracts the API returns: the full `Order`, the slimmer list row, and timeline entries (decrypting staff notes and hiding staff-only fields from buyers). It is described as the single place where an order document becomes the `Order` contract. `src/modules/orders/services/scope.ts`'s `withActions` builds on it.

## Key elements
- `presentOrder(document)` – returns `document.toJSON() as Order`. The single cast narrows the schema's `toJSON` return type. The file notes that `toJSON` leaves no date or id objects (`serialize.ts`).
- `presentOrderListItem(order, actions)` – builds an `OrderListItem` from an `ExportOrder` plus the caller's `OrderActions`. It copies only table fields (id, orderNumber, statuses, totalPrice, currency) and includes `paidAt`, `createdAt` and `deletedAt` only when defined. It leaks no address, email, lines or notes. The full record comes from the audited `GET /orders/{id}`.
- `textOf(event)` (private) – for `note_added` events with text, decrypts it via `decryptPii`. The AAD comes from `timelineNoteAad(String(event.orderId))` and the label is `'order timeline note'`. Every other event type's text is returned as stored.
- `presentTimelineEntry(event, reader)` – maps one `OrderEventDocument` to an `OrderTimelineEntry` with `id`, ISO `at`, `type`, `audience` (from `TIMELINE_AUDIENCE[type]`) and `data`. `actor` is included only when the reader is `'staff'` and the event has one. `text` is included only when non-empty. It ends with the timeline's one read-side `as` cast.
- `presentTimeline(events, reader)` – maps a page of rows through `presentTimelineEntry`.

## Relationships
- `src/modules/orders/model.ts` – supplies the `OrderDocument` and `OrderEventDocument` types.
- `src/modules/orders/domain/index.ts` – provides `TIMELINE_AUDIENCE`, which sets each entry's `audience`.
- `src/modules/orders/pii.ts` – provides `timelineNoteAad`, which binds a note's ciphertext to its order.
- `src/infrastructure/security/pii-encryption.ts` – provides `decryptPii`.
- `src/types/index.ts` – provides the `Order`, `ExportOrder`, `OrderListItem`, `OrderActions` and `OrderTimelineEntry` contracts.
- The file's comments say the export builds on `presentTimelineEntry` and reference `appendTimeline` as the typed writer of timeline rows. This file does not import `src/modules/orders/services/actions.ts`, `src/modules/orders/services/timeline.ts` or `src/modules/orders/domain/timeline.ts`.

## Notes
- The audience filter for buyers is done in the query (`BUYER_VISIBLE_TYPES`), not here. This keeps a buyer's page and its count consistent, and `presentTimeline` assumes the rows are already narrowed.
- An entry's `audience` is a property of its event type and does not change with the reader. Only `actor` varies by reader.
- The timeline cast is safe only because `type` and `data` are paired on write through `appendTimeline`, the one trusted writer.
- `presentOrder` relies on the contract tests to check the shape beyond the cast.
