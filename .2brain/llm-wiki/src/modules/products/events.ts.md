---
source: src/modules/products/events.ts
sha256: 972063162d7d9cc0087f7db8e530e8f27a15b3b00dd8f81ea57c5c60e3035493
generated_at: 2026-11-08T07:44:14.823454+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/events.ts

## Purpose

Declares the five domain events the products module emits by augmenting the kernel's `DomainEventMap` interface (via `declare module '@kernel/events'`), so the global event catalogue grows per-module without a shared enumeration file. Also exports one string constant per event name so emitters and listeners share a single spelling.

## Key elements

- **`declare module '@kernel/events'` block** – Adds five entries to `DomainEventMap`:
  - `product.deleted` – Fired on soft or hard delete (never on restore, hide, or unpurchasable). Carries `productId`, `hardDelete: boolean` (lets `inventory` decide whether to drop the level row), and `titles: Record<string, string>` (locale→name snapshot taken before translation rows are removed). Delivered via the transactional outbox; listeners must be idempotent on `meta.eventId`.
  - `product.created` – Fired once after the product document is written with `onHand: 0`. Sole listener is `inventory`, which opens the stock level. Stock never rides this event.
  - `product.release_date_changed` – Fired in the same transaction as a `releaseDate` set/clear/edit. Carries `from?` and `to?` (ISO 8601). `delivery` listens to notify affected fulfillment orders.
  - `product.restock_date_changed` – Twin of the above for `restockDate`. Same shape, same transactional guarantee.
  - `product.buyable_again` – Fired once per flip from un-buyable → buyable (shelf units arrived, backorder opened/moved, visibility restored). `stock-alerts` listens to notify buyers who asked.
- **`PRODUCT_DELETED`** – String constant `'product.deleted'`.
- **`PRODUCT_CREATED`** – String constant `'product.created'`.
- **`PRODUCT_RELEASE_DATE_CHANGED`** – String constant `'product.release_date_changed'`.
- **`PRODUCT_BUYABLE_AGAIN`** – String constant `'product.buyable_again'`.
- **`PRODUCT_RESTOCK_DATE_CHANGED`** – String constant `'product.restock_date_changed'`.

## Relationships

- **`src/modules/products/index.ts`** – Barrel file that re-exports the five `PRODUCT_*` constants so other modules import a single spelling.
- **`src/modules/products/services/crud.ts`** – Emits `product.created` after inserting a product document.
- **`src/modules/products/services/remove.ts`** – Emits `product.deleted` inside the delete transaction (both soft and hard paths).
- **`src/modules/products/tests/integration/delete-outbox.test.ts`** – Verifies the outbox wiring for `product.deleted`.
- **`src/modules/products/tests/integration/delete-titles.test.ts`** – Verifies that `titles` are captured before translation rows are dropped on hard delete.
- **`src/modules/products/tests/integration/backorder.test.ts`** – Exercises the `product.buyable_again` emission path when a backorder opens.
- **`src/modules/products/tests/integration/preorder.test.ts`** – Exercises `product.release_date_changed` / `product.restock_date_changed` emission on date edits.

## Notes

- Events are declared via TypeScript **module augmentation**, not a separate event-registry file; adding a new product event means adding one key to this interface.
- All events are written through the **transactional outbox** in the same DB transaction as the state change, guaranteeing "event exists ⇔ write committed."
- `product.deleted` deliberately does **not** fire on restore, hide (`active: false`), or unpurchasable (`purchasable: false`)—only on the destructive delete path.
- `titles` on `product.deleted` is a snapshot taken **before** translation rows are deleted; any consumer that needs names must read from the event payload, not the database.
- The `hardDelete` flag on `product.deleted` is the only signal listeners receive to distinguish reversible from destructive deletion; do not conflate it with `active` / `purchasable`.
