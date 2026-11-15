---
source: src/modules/wishlist/module.ts
sha256: b2f1df87221d1ad259082e185275c263b29175793b4bad25424ab25cf95020f7
generated_at: 2026-11-14T22:53:02.403264+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/module.ts

## Purpose

Module manifest for the wishlist feature. Wires together the module's routes, config, data-portability/erasure hooks, and domain-event subscriptions into a single `AppModule` export that the kernel registry can mount. It exists so the wishlist's cross-cutting concerns (lifecycle hooks, event reactions, locale resolution) live in one place rather than scattered across service or route files.

## Key elements

- **`default` (AppModule manifest)** — The module object: name, route mounts, config slices, `personalData` hooks, `subscribe`, and `locales` path.
- **`personalData.collect`** — Exports a user's wishlist lines via `wishlistService.exportLines` for data-portability.
- **`personalData.erase`** — Removes all lines for a user; joins the caller's existing hard-delete transaction through the `session` parameter (`wishlistService.removeByUserId`).
- **`subscribe()`** — Registers a `PRODUCT_DELETED` listener: checks `productService.isLive(productId)` before calling `wishlistService.removeByProductId`, so a restored product (retried delivery) does not trigger a spurious removal.
- **`mounts`** — Registers the wishlist router under the `/wishlist` base path.
- **`locales`** — Points the kernel to `./locales` for i18n strings.

## Relationships

- **`src/kernel/registry.ts`** — Imports the `AppModule` type that the default export satisfies.
- **`src/kernel/events.ts`** — Imports `onDomainEvent` to subscribe to domain events.
- **`src/modules/products/index.ts`** — Imports `PRODUCT_DELETED` event constant and `productService` (used in the event handler to check liveness).
- **`src/modules/wishlist/routes.ts`** — Imports the `router` that gets mounted at `/wishlist`.
- **`src/modules/wishlist/service.ts`** — Imports `wishlistService` for all data operations (export, remove by user, remove by product).
- **`src/modules/wishlist/config.ts`** — Imports `wishlistConfig` for the config slice.
- **`tests/integration/erasure.test.ts`** — Integration test exercising this module's account-erasure data hook.
- **`src/modules/cart/tests/integration/product-restored-meanwhile.test.ts`** — Tests the "skip removal if product is live again" guard in the `PRODUCT_DELETED` handler.

## Notes

- The `PRODUCT_DELETED` handler is intentionally non-trivial: it performs an async `isLive` check before deleting, because a retried event delivery can arrive *after* a product restore. Removing the line in that case would mislead a shopper ("removed") about a product that is back on sale.
- Cart and user-account cleanup are handled via domain events and the `personalData` hook respectively, deliberately *not* through direct imports, to keep the module dependency graph acyclic.
- `erase` does not open its own transaction; it relies on the `session` object passed in by the caller (typically the account-erasure orchestrator) to participate in the same hard-delete transaction.
