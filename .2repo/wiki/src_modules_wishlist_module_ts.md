# src/modules/wishlist/module.ts

## Purpose

Wiring/manifest file for the wishlist module. It assembles the `AppModule` contract—routes, event subscriptions, demo seeding, and locale path—without containing any business logic itself. All behavior is delegated to `./routes`, `./service`, and `./demo`.

## Key elements

- **Default export (`AppModule`)** — The single module manifest. Declares `name`, `basePath` (`/wishlist`), `routes`, `subscribe`, `seeds`, `seedExport`, `demoShapes`, and `locales`.
- **`subscribe()`** — Registers two domain-event handlers:
  - `PRODUCT_DELETED` → calls `productRemoveFromWishlistsById(productId)` to purge the product from every user's wishlist.
  - `USER_DELETED` → calls `wishlistDeleteByUserId(userId)` to drop the user's wishlist document.
- **`routes`** — Imported from `./routes`; mounted under `/wishlist`.
- **`seeds` / `seedExport`** — Imported from `./demo`; used for dev seeding and exporting seeded data.
- **`demoShapes`** — `{ wishlists: 'stored' }` signals the data is persisted, not ephemeral.
- **`locales`** — Points to a `locales` directory alongside this file.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/events.ts` | Imports `onDomainEvent` to subscribe to domain events. |
| `src/kernel/registry.ts` | Imports the `AppModule` type used in the `satisfies` clause. |
| `src/modules/products/index.ts` | Imports the `PRODUCT_DELETED` event constant. |
| `src/modules/users/index.ts` | Imports the `USER_DELETED` event constant. |
| `src/modules/wishlist/routes.ts` | Provides the Hono/Fastify router attached to `routes`. |
| `src/modules/wishlist/service.ts` | Provides `wishlistDeleteByUserId` and `productRemoveFromWishlistsById` used inside `subscribe()`. |
| `src/modules/wishlist/demo.ts` | Provides `seedWishlistsCollection` and `exportSeededWishlists`. |
| `src/modules.ts` | Likely imports this default export to register the module in the app. |

## Notes

- This file is **purely declarative wiring**—it holds zero business logic. If you need to understand *what* happens on a product deletion or user deletion, look in `./service`; the cleanup rules live there.
- The event subscriptions implement **reverse-direction cascade**: wishlist never imports products/users directly for reads; it reacts to their deletion events. This keeps the import graph acyclic (products/users don't import wishlist).
- `demoShapes` uses the string `'stored'` (not a boolean or object). This is a convention the kernel uses to decide how to render demo data for the caller.
