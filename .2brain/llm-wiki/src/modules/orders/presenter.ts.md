---
source: src/modules/orders/presenter.ts
sha256: e260142a6053cfd445bf152f45445108d0f60a44a68928878aa757391c2fe433
generated_at: 2026-11-14T20:40:12.923224+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/presenter.ts

## Purpose

The single translation point that converts order storage documents into the `Order` wire contracts consumed by API responses. Every order read path funnels through this module so that formatting, PII handling, and audience-based field stripping live in exactly one place.

## Key elements

- **`presentOrder(document: OrderDocument): Order`** — Calls `document.toJSON()` and casts to the `Order` contract. The cast exists because Mongoose's `.toJSON()` overloads resolve to the schema type, not the domain type.
- **`presentOrderListItem(order: ExportOrder, actions: OrderActions): OrderListItem`** — Projects a full `ExportOrder` down to the minimal fields a list row needs (id, number, statuses, price, timestamps). Conditionally includes `paidAt`, `createdAt`, `deletedAt` only when present. Attaches the caller's `actions`.
- **`presentTimelineEntry(event: OrderEventDocument, reader: 'buyer' | 'staff'): OrderTimelineEntry`** — Maps one stored timeline row to the wire shape. Includes `actor` only for staff readers. Decrypted text is included conditionally. Derives `audience` from `TIMELINE_AUDIENCE[event.type]`.
- **`presentTimeline(events: readonly OrderEventDocument[], reader): OrderTimelineEntry[]`** — Maps a page of already-filtered events through `presentTimelineEntry`.
- **`textOf(event)`** *(private)* — Returns `event.text` as-is, except for `note_added` rows where it decrypts PII using the order-ID-bound AAD.

## Relationships

- **`src/types/index.ts`** — Source of every wire-contract type this file imports: `Order`, `ExportOrder`, `OrderActions`, `OrderListItem`, `OrderTimelineEntry`.
- **`src/modules/orders/model.ts`** — Provides the storage-side types `OrderDocument` and `OrderEventDocument` that serve as input parameters.
- **`src/modules/orders/domain/index.ts`** — Supplies `TIMELINE_AUDIENCE`, the static map from event type to its intended audience, used to populate each entry's `audience` field.
- **`src/infrastructure/security/pii-encryption.ts`** — Provides `decryptPii`, the only decryption call in this file.
- **`src/modules/orders/pii.ts`** — Provides `timelineNoteAad`, which builds the authenticated-encryption AAD string from the order ID, ensuring notes are bound to their order.

## Notes

- The file explicitly does **not** filter timeline rows by audience — that is the query's job (`BUYER_VISIBLE_TYPES` in `services/timeline.ts`). `presentTimeline` assumes the input array is already narrowed.
- `presentOrder` is the only export that performs a type assertion (`as Order`). The doc comment flags this as the same pattern used in `products/presenter.ts` and the one place the compiler can't narrow on its own.
- PII decryption is scoped to `note_added` events only; all other timeline text is stored and served verbatim.
- `presentOrderListItem` omits address, email, line-item, and note fields by construction — a list row never leaks full-record data.
