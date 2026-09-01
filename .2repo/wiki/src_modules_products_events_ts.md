# src/modules/products/events.ts

## Purpose

Declares the products module's domain events by augmenting the kernel's `DomainEventMap` interface, so the event catalogue grows per-module without a shared enumeration file. Also exports the single event-name constant to keep emitters and listeners in agreement on the spelling.

## Key elements

- **Module augmentation of `@kernel/events`** — adds the `'product.deleted'` key (payload: `{ productId: string }`) to the `DomainEventMap` interface. Emitted and awaited *before* the write; also fires on restore.
- **`PRODUCT_DELETED`** — exported constant (`'product.deleted'`) so emitters and listeners reference one symbol instead of duplicating the string literal.
- **Deliberate absence of a stock event** — a comment documents that `product.stock_moved` was removed because it caused rollback paths to skip the audit row; that row is now written atomically with the counter in `@modules/inventory`.

## Relationships

- **`src/modules/products/index.ts`** — barrel file that re-exports `PRODUCT_DELETED` so other modules import the constant through a single entry point.
- **`src/modules/products/module.ts`** — module registration point that wires listeners for `PRODUCT_DELETED` into the kernel's event bus.
- **`src/modules/products/service.ts`** — emits the `product.deleted` event (awaited before the write) and is the primary consumer of the `DomainEventMap` typing this file augments.

## Notes

- The event is emitted on **restore** as well as soft/hard delete. The comment explains this is intentional: re-adding cart lines after a restore is left to the user, not the catalogue.
- The module augmentation pattern means adding a new event here is all that's needed to make it type-safe across the codebase — no shared registry file to edit.
