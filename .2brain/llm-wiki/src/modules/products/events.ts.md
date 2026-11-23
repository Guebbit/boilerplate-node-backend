---
source: src/modules/products/events.ts
source_sha256: 46b4a8c14caac0af59f22b12346cb1d5033d760d831cc84cc0e982beb0567062
context_sha256: 120370733466493b040ce3a7b9cd52aa6b3ae009a00da14bb6c816d0ae3a252a
generated_at: 2026-11-22T07:09:40.346848+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/events.ts

## Purpose
Declares the string constants for the domain events the products module emits. Each constant is typed with `satisfies DomainEventName`, so emitters and listeners share a single spelling and a typo is caught at compile time. The events themselves are declared in `./asyncapi.domain-events.yaml`.

## Key elements
- `PRODUCT_CREATED` (`'product.created'`): the event listeners subscribe to for new products. Its payload is described in `DomainEventMap`.
- `PRODUCT_DELETED` (`'product.deleted'`): emitted when a product is deleted.
- `PRODUCT_RELEASE_DATE_CHANGED` (`'product.release_date_changed'`): the event `delivery` subscribes to for a moved release date.
- `PRODUCT_RESTOCK_DATE_CHANGED` (`'product.restock_date_changed'`): the event `delivery` subscribes to for a moved restock date.
- `PRODUCT_TERMS_CHANGED` (`'product.terms_changed'`): the event `inventory` subscribes to when anything that decides a product's availability changes.

## Relationships
- `src/kernel/events.ts`: supplies the `DomainEventName` type that every constant must satisfy, and `DomainEventMap`, which holds the payloads.
- `src/modules/products/index.ts`: the constants are exported through this barrel, so other modules import them from there.
- `src/modules/products/services/crud.ts` and `src/modules/products/services/remove.ts`: the module's write and delete services. They are graph neighbors of this file, so they most likely import these names to emit events. The file itself does not show this.
- `src/modules/products/tests/integration/` (`backorder`, `delete-outbox`, `delete-titles`, `preorder`, `terms-changed`): integration tests that are graph neighbors of this file. They presumably use these constants to check emitted events.

## Notes
- The file contains only constants and no runtime logic. Adding an event means adding it to `DomainEventName` in the kernel and to the AsyncAPI YAML, then declaring a constant here.
- The `delivery` and `inventory` subscribers are named only in the doc comments. Those modules are not among this file's neighbors.
