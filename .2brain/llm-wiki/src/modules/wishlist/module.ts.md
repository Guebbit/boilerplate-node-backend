---
source: src/modules/wishlist/module.ts
sha256: 0c182c2bc88ba9a344fd2b2506448f4dea313604e0734e7eaf7b1374a27c04a7
generated_at: 2026-11-08T09:13:04.697326+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/module.ts

## Purpose

Module manifest that registers the wishlist feature with the kernel: it mounts the HTTP router, subscribes to the `PRODUCT_DELETED` domain event, and exposes a `personalData` hook for GDPR-style export and hard-delete. All business logic lives in `service.ts`; this file only wires the module into the application.

## Key elements

- **`default` export (`AppModule`)** — The manifest object the kernel loads at startup.
  - `mounts` — Registers the wishlist router at `/wishlist`.
  - `personalData[0].collect` — Calls `wishlistService.exportLines` to serialize a user's saved products for data export.
  - `personalData[0].erase` — Calls `wishlistService.removeByUserId`, passing the caller's session so the delete joins the same hard-delete transaction.
  - `subscribe` — Subscribes to `PRODUCT_DELETED`; before removing the line it checks `productService.isLive(productId)` to skip removal when a restore has already occurred (handles retried delivery).
  - `locales` — Points to the `locales/` directory for i18n strings.

## Relationships

- **`src/kernel/registry.ts`** — Supplies the `AppModule` type that constrains the default export shape.
- **`src/kernel/events.ts`** — Provides `onDomainEvent`, the subscription helper used in `subscribe`.
- **`src/modules/products/index.ts`** — Exports `PRODUCT_DELETED` (event constant) and `productService` (used for the `isLive` guard).
- **`src/modules/wishlist/routes.ts`** — Supplies the `router` mounted under `/wishlist`.
- **`src/modules/wishlist/service.ts`** — Supplies `wishlistService` (export, remove-by-user, remove-by-product).
- **`src/modules/wishlist/openapi.yaml`** — The OpenAPI spec describing the routes declared by `routes.ts`.
- **`tests/integration/erasure.test.ts`** — Exercises the `personalData.erase` hook end-to-end.
- **`src/modules/cart/tests/integration/product-restored-meanwhile.test.ts`** — Covers the restore-after-delete race that the `isLive` guard in `subscribe` addresses.

## Notes

- The `isLive` check in `subscribe` is a deliberate guard against a retried `PRODUCT_DELETED` event arriving *after* a product has been restored. Without it, a shopper would see a "removed" notification for a product that is back on sale.
- `erase` receives the caller's `session` and is expected to participate in the caller's existing hard-delete transaction rather than opening its own; see `wishlistService.removeByUserId` for details.
- The module intentionally holds no domain rules beyond product-reference cleanup. Deletion of a wishlist line is a convenience, not a capability, so no separate state machine is modelled.
