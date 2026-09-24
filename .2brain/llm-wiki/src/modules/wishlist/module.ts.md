---
source: src/modules/wishlist/module.ts
sha256: df17b0ba9ee51ef87d050a4204f9c338b9b84f11c813b20d7c0ec99e38b7e1e1
generated_at: 2026-09-23T19:47:31.038567+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/module.ts

## Purpose

Module manifest for the wishlist feature. It wires the wishlist's HTTP routes, domain-event subscriptions (cleanup on product/user deletion), a personal-data collector for account exports, and locale files into the application's module registry. The wishlist itself is a single document per user holding product references; this file contains no business logic beyond that wiring.

## Key elements

- **`default` export** — An object satisfying `AppModule` with:
  - `name` / `basePath` — Identifies the module and its URL prefix (`/wishlist`).
  - `routes` — The Express router from `./routes`.
  - `personalData` — A collector that calls `wishlistService.wishlistGet(userId)` and returns the user's saved items (used by the account data-export flow).
  - `subscribe` — Registers two `onDomainEvent` handlers:
    - `PRODUCT_DELETED` → `productRemoveFromWishlistsById(productId)`
    - `USER_DELETED` → `wishlistDeleteByUserId(userId)`
  - `locales` — Path to the `locales/` directory relative to this file.

## Relationships

- **`src/kernel/registry.ts`** — Supplies the `AppModule` type that the default export must satisfy.
- **`src/kernel/events.ts`** — Supplies `onDomainEvent`, the subscription mechanism used inside `subscribe()`.
- **`src/modules.ts`** — The module loader that imports and registers this default export.
- **`src/modules/products/index.ts`** — Exports `PRODUCT_DELETED`, the event this module subscribes to for stale-reference cleanup.
- **`src/modules/users/index.ts`** — Exports `USER_DELETED`, the event this module subscribes to for orphaned-wishlist cleanup.
- **`src/modules/wishlist/routes.ts`** — Provides the `router` attached to this manifest.
- **`src/modules/wishlist/service.ts`** — Provides `wishlistDeleteByUserId`, `productRemoveFromWishlistsById`, and `wishlistService` (used in the personal-data collector).
- **`src/modules/wishlist/module.yaml`** — Co-located manifest metadata (consumed by tooling or the runtime alongside this file).
- **`src/modules/account/module.yaml`** — The account module that likely consumes the `personalData` collector declared here to build the user's data export.

## Notes

- Event subscriptions are registered at module-init time via the `subscribe()` callback, not at import time. Ensure the module loader calls `subscribe()` after all modules are loaded so event bus is ready.
- The personal-data collector is a **fire-and-forget async** call (`wishlistGet(...).then(...)`) — callers must not assume it is synchronous.
- Cleanup is purely reactive (event-driven); there is no periodic sweep or foreign-key constraint. If an event is lost, stale wishlist entries persist.
- The doc comment explicitly notes the wishlist has no domain rules of its own beyond "deleting it costs a convenience, not a capability" — do not expect invariants or validation logic in the service layer beyond basic CRUD.
