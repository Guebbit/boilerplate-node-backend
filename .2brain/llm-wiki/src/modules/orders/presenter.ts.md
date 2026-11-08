---
source: src/modules/orders/presenter.ts
sha256: 1da466769b114b7927f8905f2a2c7c3e07b629414675c6a34a75d671cf908a2b
generated_at: 2026-11-08T06:54:09.236379+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/presenter.ts

## Purpose
Single translation point from stored order documents (Mongoose schemas) to the wire-level `Order` contract and `OrderTimelineEntry[]` shapes. It owns audience-aware rendering (buyer vs. staff) and PII decryption for timeline notes, so no other layer re-implements that logic.

## Key elements
- **`presentOrder(document: OrderDocument): Order`** – Calls `document.toJSON()` and casts to the `Order` type. This is the one line that turns storage into wire.
- **`textOf(event): string | undefined`** (module-private) – Returns decrypted text for `note_added` events (ciphertext bound to the order ID via `timelineNoteAad`); passes all other event text through unchanged.
- **`presentTimelineEntry(event, reader): OrderTimelineEntry`** – Renders one timeline row. Staff readers receive `actor` (if present); buyers never do. Always includes the type-derived `audience` and, when present, the resolved `text`.
- **`presentTimeline(events, reader): OrderTimelineEntry[]`** – Filters rows by audience (`isBuyerVisible` for buyers, all for staff) then maps each through `presentTimelineEntry`.

## Relationships
- **`src/types/index.ts`** – Source of the `Order` and `OrderTimelineEntry` wire types this file produces.
- **`src/modules/orders/model.ts`** – Source of the `OrderDocument` / `OrderEventDocument` storage types this file consumes.
- **`src/modules/orders/domain/index.ts`** – Supplies `TIMELINE_AUDIENCE` (type → audience mapping) and `isBuyerVisible` (buyer-visibility predicate).
- **`src/infrastructure/security/pii-encryption.ts`** – Provides `decryptPii`, used to decrypt staff-note ciphertext.
- **`src/modules/orders/pii.ts`** – Provides `timelineNoteAad`, the AAD string that binds note ciphertext to its order ID.
- **`src/modules/orders/domain/timeline.ts`** – Defines the timeline domain rules (audience constants, visibility) re-exported through `domain/index.ts`.
- **`src/modules/orders/services/timeline.ts`** – The write-side (`appendTimeline`) that guarantees each `type` is paired with its matching `data`, which is the invariant `presentTimelineEntry`'s single `as` cast relies on.

## Notes
- `presentOrder` casts with `as Order` because Mongoose's `.toJSON()` overload returns the schema's own type, not the `Order` contract — the compiler cannot narrow it automatically (same pattern as `products/presenter.ts`).
- `presentTimelineEntry` contains one deliberate `as OrderTimelineEntry` cast; it is safe because only `appendTimeline` writes `type`/`data` pairs, so the pairing invariant holds at read time.
- `actor` is conditionally spread (`...(reader === 'staff' && event.actor ? … : {})`) so the key is absent for buyers rather than explicitly `undefined`.
- Only `note_added` events carry encrypted PII text; every other timeline type stores its `text` in plaintext.
