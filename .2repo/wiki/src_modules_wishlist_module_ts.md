# src/modules/wishlist/module.ts

## Purpose

Declares the wishlist module as a single `AppModule` object that the kernel can register. It wires the module's HTTP routes, cross-module dependencies, domain-event subscriptions, seed functions, and demo shape into one place so the rest of the application never needs to import individual wishlist pieces directly.

## Key elements

- **Default export** — an object satisfying `AppModule` (from `@kernel/registry`) with:
  - `name: 'wishlist'`, `subdomain: 'supporting'`, `basePath: '/wishlist'`
  - `routes` — the Express/Hono router imported from `./routes`
  - `dependsOn` — declarative list of soft dependencies on **cart** (customer-supplier), **products** (conformist), **users** (conformist)
  - `subscribe()` — registers two `onDomainEvent` handlers:
    - `PRODUCT_DELETED` → calls `productRemoveFromWishlistsById`
    - `USER_DELETED` → calls `wishlistDeleteByUserId`
  - `seeds` / `seedExport` — imported from `./demo`
  - `demoShapes` — `{ wishlists: 'stored' }`
  - `locales` — filesystem path built with `path.join(__dirname, 'locales')`

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type that the default export satisfies.
- **`src/kernel/events.ts`** — provides `onDomainEvent`, used inside `subscribe()` to listen for cross-module events.
- **`src/modules/products/index.ts`** — exports the `PRODUCT_DELETED` event constant consumed here.
- **`src/modules/users/index.ts`** — exports the `USER_DELETED` event constant consumed here.
- **`src/modules/wishlist/routes.ts`** — supplies the `router` object mounted at `/wishlist`.
- **`src/modules/wishlist/service.ts`** — supplies `wishlistDeleteByUserId` and `productRemoveFromWishlistsById`, invoked only within event handlers (no HTTP-layer coupling).
- **`src/modules/wishlist/demo.ts`** — supplies the seed and seed-export functions.
- **`src/modules.ts`** — upstream aggregator that imports this module to register it with the kernel.

## Notes

- Cross-module side effects (product deletion, user deletion) are handled **exclusively via domain events**, keeping the static import graph acyclic. There are no direct function-level imports from `products/` or `users/` business logic.
- The `dependsOn` array is **declarative metadata** (DDC relationship labels) — it does not create runtime imports. The only runtime cross-module imports are the two event-constant values.
- `__dirname` is used, indicating the file runs under a CommonJS transpilation context (or a bundler that preserves it); it will not work in a pure ESM runtime without a shim.
- The module is intentionally labelled **supporting**: it holds no business rules of its own, only a stored list of product references.
