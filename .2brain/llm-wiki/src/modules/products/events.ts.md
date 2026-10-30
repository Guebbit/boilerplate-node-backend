---
source: src/modules/products/events.ts
sha256: 18d2b4471dc9c341cb7580f56c39557d5ec522f7b9f93ea47633b25c41179d83
generated_at: 2026-10-29T05:26:13.826171+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/events.ts

## Purpose

Declares the products module's domain-event payloads by augmenting the kernel's `DomainEventMap` interface (module augmentation, not direct editing) and exports string constants for each event name. This keeps the event catalogue distributed—each module owns its own payloads—and gives emitters and listeners a single shared spelling instead of independent string literals.

## Key elements

- **`declare module '@kernel/events' { interface DomainEventMap { … } }`** — Adds five product-owned event types to the app-wide map:
  - `'product.deleted'` — `{ productId, hardDelete, titles }`. Emitted on soft or hard delete; the only catalogue event that pulls cart/wishlist lines. `hardDelete` distinguishes destructive from reversible; `titles` preserves names before translation rows are dropped.
  - `'product.created'` — `{ productId }`. Inventory is the sole listener; it opens a zero stock-level row.
  - `'product.release_date_changed'` — `{ productId, from?, to? }`. ISO-8601 dates; `from` absent on first set, `to` absent on clear.
  - `'product.restock_date_changed'` — same shape as release_date_changed; covers owed units on a released product.
  - `'product.buyable_again'` — `{ productId }`. Fires once per "un-buyable → buyable" flip (restock, backorder date move, or visibility/purchasability change).
- **`PRODUCT_DELETED`, `PRODUCT_CREATED`, `PRODUCT_RELEASE_DATE_CHANGED`, `PRODUCT_BUYABLE_AGAIN`, `PRODUCT_RESTOCK_DATE_CHANGED`** — Exported string constants (one per event) so emitters and listeners reference the same token.

## Relationships

- **`services/crud.ts`** — Emits `product.created`, `product.release_date_changed`, `product.restock_date_changed`, and `product.buyable_again` through the transactional outbox.
- **`services/remove.ts`** — Emits `product.deleted` (soft or hard) in the same transaction as the delete write.
- **`module.ts`** — Wires product listeners for events emitted by other modules (e.g., `product.created` → inventory).
- **`index.ts`** — Barrel that re-exports the event-name constants so downstream code imports a single path.
- **Tests** (`backorder.test.ts`, `delete-outbox.test.ts`, `delete-titles.test.ts`, `preorder.test.ts`) — Assert that the correct events are emitted with the expected payloads (e.g., titles survive hard delete, outbox relay redelivers on listener failure).

## Notes

- All product events go through the **transactional outbox**: the event row is written in the same DB transaction as the domain write, and the relay redelivers until every listener has processed it. Listeners must therefore be **idempotent on `meta.eventId`**.
- `product.created` has a **one-way dependency inversion**: `inventory` already imports the products module, so products cannot import `inventory` back. The event is the only coupling.
- `titles` in `product.deleted` is populated **before** the hard delete drops translation rows; once the event is delivered the product no longer exists, so downstream consumers (e.g. notifications) can only quote what travelled with the event.
- `product.buyable_again` fires **once per state flip**, not continuously while the product is buyable.
- No event is emitted for merely hiding (`active: false`) or unpurchasable (`purchasable: false`) transitions, and no placed order is ever cancelled by a catalogue change.
