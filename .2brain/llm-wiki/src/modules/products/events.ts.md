---
source: src/modules/products/events.ts
sha256: 0d17d63ea57e8dfecaff2b45ddb7f8f7bd47dda161db64ca1b729fbc77de0415
generated_at: 2026-10-15T11:41:46.056785+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/events.ts

## Purpose

Declares the products module's domain events by augmenting the kernel's `DomainEventMap` interface (type-level only, no runtime logic), and exports one string constant per event name so emitters and listeners share a single spelling instead of independent literals.

## Key elements

- **`declare module '@kernel/events'`** — extends `DomainEventMap` with three entries:
  - `product.deleted` — payload `{ productId, hardDelete, titles }`; emitted (via outbox) when a product is soft- or hard-deleted. Carries multi-language titles captured before translation rows are dropped; `hardDelete` flag lets `inventory` distinguish reversible from destructive deletion.
  - `product.created` — payload `{ productId, onHand }`; emitted in the create transaction so `inventory` can set the counter and write its ledger row in one step, avoiding a direct import that would cycle.
  - `product.release_date_changed` — payload `{ productId, from?, to? }`; emitted when `releaseDate` is set, moved, or cleared; consumed by `delivery` to assess buyer notifications.
- **`PRODUCT_DELETED`**, **`PRODUCT_CREATED`**, **`PRODUCT_RELEASE_DATE_CHANGED`** — `export const` string constants for the three event names, exported through the barrel for shared use.

## Relationships

- **`src/modules/products/index.ts`** — re-exports the three `PRODUCT_*` constants as part of the module's public barrel.
- **`src/modules/products/module.ts`** — registers this module's event subscriptions (which listeners fire on which event names).
- **`src/modules/products/services/crud.ts`** — emits `product.created` and `product.release_date_changed` within its write transactions.
- **`src/modules/products/services/remove.ts`** — emits `product.deleted` (soft or hard) in the delete transaction, populating `titles` before any row is dropped.
- **`src/modules/products/tests/integration/delete-outbox.test.ts`** — verifies the outbox write pattern for `product.deleted`.
- **`src/modules/products/tests/integration/delete-titles.test.ts`** — verifies that `titles` in the event payload is captured pre-deletion.
- **`src/modules/products/tests/integration/preorder.test.ts`** — exercises `product.release_date_changed` in a preorder scenario.

## Notes

- The file contains **no runtime logic** beyond three `const` declarations; all behavioral contracts live in the docblock comments on the type augmentation.
- All three events go through the **transactional outbox** (same DB transaction as the triggering write) and the relay guarantees redelivery, so listeners must be idempotent on `meta.eventId`.
- `product.deleted` deliberately does **not** fire on restore; past side-effects (emptied carts/wishlists) are not rolled back.
- `product.created` is intentionally a one-shot creation signal, **not** repeated on stock updates, to avoid the inconsistent state a separate counter-change + ledger-write pair could produce.
