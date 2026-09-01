# src/modules/wishlist/module.ts

## Purpose

Module manifest for the wishlist feature. It registers the module's name, base path, routes, event subscriptions, demo seeding, and locale path into the kernel's `AppModule` contract so the application can discover and wire up the module at startup.

## Key elements

- **Default export** – An object `satisfies AppModule` that bundles every piece of module metadata in one place.
- **`subscribe()`** – Registers two domain-event handlers: on `PRODUCT_DELETED` it calls `productRemoveFromWishlistsById`; on `USER_DELETED` it calls `wishlistDeleteByUserId`. These keep wishlists consistent without the wishlist module importing products/users at runtime.
- **`routes`** – The Express/Hono router imported from `./routes`, mounted at `basePath: '/wishlist'`.
- **`seeds` / `seedExport`** – `seedWishlistsCollection` (from `./demo`) and `exportSeededWishlists` for demo data injection and retrieval.
- **`demoShapes`** – Declares `{ wishlists: 'stored' }`, indicating the `GET /wishlist` endpoint resolves the caller's list against the product catalogue.
- **`locales`** – Resolves to a `locales/` directory next to this file.

## Relationships

- **`src/kernel/registry.ts`** – Supplies the `AppModule` type the manifest must satisfy.
- **`src/kernel/events.ts`** – Supplies `onDomainEvent`, the subscription API used inside `subscribe()`.
- **`src/modules/products/index.ts`** – Exports the `PRODUCT_DELETED` event constant referenced by the subscription.
- **`src/modules/users/index.ts`** – Exports the `USER_DELETED` event constant referenced by the subscription.
- **`src/modules/wishlist/routes.ts`** – Provides the `router` attached to the manifest.
- **`src/modules/wishlist/demo.ts`** – Provides `seedWishlistsCollection` and `exportSeededWishlists`.
- **`src/modules/wishlist/service.ts`** – Provides `wishlistDeleteByUserId` and `productRemoveFromWishlistsById` used as event-handler callbacks.
- **`src/modules.ts`** – Aggregates this module alongside other module manifests for the application entry point.

## Notes

- The module is a **leaf** in the import graph ("Reached by: nothing"). It does not export any symbols other than the default manifest object.
- Cleanup of orphaned wishlist entries is **event-driven**, not import-driven: products and users emit domain events rather than calling wishlist code directly. This is the mechanism that keeps the cross-module dependency graph acyclic.
- `path.join(__dirname, 'locales')` is a runtime path resolution; the directory must exist relative to the compiled output location.
