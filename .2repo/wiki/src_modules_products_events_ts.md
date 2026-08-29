# src/modules/products/events.ts

## Purpose

Declares the domain events owned by the products module. Uses TypeScript module augmentation (`declare module '@kernel/events'`) so the event catalogue grows organically with each module rather than being centralized in a shared file. Also exports the canonical string constant for the event name.

## Key elements

- **`DomainEventMap['product.deleted']`** — Module-augmented event type; payload is `{ productId: string }`. Emitted and *awaited before* the write (soft-delete, hard-delete, or restore) so listeners that drop references still see a consistent DB. Also fires on restore because re-adding cart lines is the user's decision, not the catalogue's.
- **`PRODUCT_DELETED`** — Exported constant equal to `'product.deleted'`. Serves as the single source of truth for the event name so emitters and listeners share one spelling instead of two independent string literals.

## Relationships

- **`src/modules/products/index.ts`** — Barrel file; re-exports `PRODUCT_DELETED` so consumers of the module don't import from the events file directly.
- **`src/modules/products/service.ts`** — Emitter of the `product.deleted` event; calls and awaits it before performing the product state transition.
- **`src/modules/products/module.ts`** — Registers the module's event list (including `PRODUCT_DELETED`) with the kernel so listeners can subscribe.

## Notes

- **No stock event.** A former `product.stock_moved` event was removed: it turned the ledger row into a *reaction* rather than half of the write, and rollback paths failed to announce it, corrupting the audit trail. Stock counter + ledger row are now written atomically in `@modules/inventory`.
- **Why `product.deleted` stays an event (unlike stock):** the listener (e.g., cart cleanup) is genuinely optional—a shop that simply never drops its cart references still functions, just with stale lines.
- **Convention:** augment `DomainEventMap` in the owning module's `events.ts`; never edit the kernel file directly.
