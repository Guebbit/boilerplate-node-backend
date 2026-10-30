---
source: src/modules/wishlist/module.ts
sha256: 0c182c2bc88ba9a344fd2b2506448f4dea313604e0734e7eaf7b1374a27c04a7
generated_at: 2026-10-29T06:34:21.250060+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/module.ts

## Purpose

Module manifest for the wishlist feature. Wires the wishlist's router, personal-data hooks, and domain-event subscription into the application registry so the kernel can mount, export, erase, and react on the module's behalf.

## Key elements

- **Default export (`AppModule`)** — the manifest object the kernel consumes to register the module.
- **`mounts`** — mounts the wishlist `router` (from `./routes`) at base path `/wishlist`.
- **`personalData[0]`** — declares the `wishlist` section:
  - `collect` — calls `wishlistService.exportLines(userId)` to serialize lines for data-export.
  - `erase` — calls `wishlistService.removeByUserId(userId, session)`, joining the caller's hard-delete transaction.
- **`subscribe`** — subscribes to `PRODUCT_DELETED`; on delivery it checks `productService.isLive(productId)` and only removes wishlist lines if the product is *not* live (guards against retried events arriving after a restore).
- **`locales`** — resolves the `locales/` directory relative to this file.

## Relationships

- **`src/kernel/registry.ts`** — imports the `AppModule` type that shapes this manifest.
- **`src/kernel/events.ts`** — imports `onDomainEvent` used inside `subscribe`.
- **`src/modules/products/index.ts`** — imports the `PRODUCT_DELETED` event constant and `productService` for the liveness check.
- **`src/modules/wishlist/routes.ts`** — provides the `router` passed into `mounts`.
- **`src/modules/wishlist/service.ts`** — provides `wishlistService` used by both personal-data hooks and the event handler.
- **`src/modules/wishlist/module.yaml`** — companion YAML manifest for the same module.
- **`src/modules.ts`** — aggregate that likely re-exports or registers this module.
- **`tests/integration/erasure.test.ts`** — integration test exercising the `erase` hook.

## Notes

- The `PRODUCT_DELETED` handler is intentionally defensive: a retried delivery can land *after* a product is restored, so `isLive()` gates the removal to avoid telling shoppers a live product was removed.
- The `erase` hook threads the `session` object into `removeByUserId`, meaning it participates in the caller's transaction rather than opening its own.
- The module deliberately does **not** import the cart module (move-to-cart is triggered from cart's side) to keep the dependency graph acyclic.
