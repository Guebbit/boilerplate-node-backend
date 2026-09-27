---
source: src/modules/wishlist/module.ts
sha256: 0e01ea502c2df900cd0acb82f9848230163e16a4af6caedd724d89148ae6289f
generated_at: 2026-09-27T15:45:58.042327+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/module.ts

## Purpose

Module manifest and wiring for the wishlist feature. Registers routes, a `personalData` hook for account erasure, and a domain-event subscription so that deleted products are cleaned out of every wishlist. It is deliberately thin — no domain logic lives here, only the glue that connects the wishlist service to the kernel lifecycle.

## Key elements

- **Default export** — an object satisfying `AppModule` with:
  - `name: 'wishlist'`, `basePath: '/wishlist'`
  - `routes` — the Express router from `./routes`
  - `personalData` — a single section (`'wishlist'`) exposing `collect` (reads the user's saved items via `wishlistService.wishlistGet`) and `erase` (calls `wishlistDeleteByUserId`)
  - `subscribe` — registers a `PRODUCT_DELETED` handler that invokes `productRemoveFromWishlistsById`
  - `locales` — path to the `locales/` directory alongside this file
- **`onDomainEvent(PRODUCT_DELETED, …)`** — the only runtime side-effect of this module; fires when a product is deleted anywhere in the system.

## Relationships

- **`src/kernel/registry.ts`** — provides the `AppModule` type; the default export is validated against it via `satisfies`.
- **`src/kernel/events.ts`** — provides `onDomainEvent`, the kernel's event-bus subscription API used in `subscribe`.
- **`src/modules/products/index.ts`** — exports the `PRODUCT_DELETED` event constant consumed by the subscription.
- **`src/modules/wishlist/routes.ts`** — supplies the HTTP router mounted at `/wishlist`.
- **`src/modules/wishlist/service.ts`** — supplies `wishlistService` (read), `wishlistDeleteByUserId` (erase), and `productRemoveFromWishlistsById` (event cleanup).
- **`src/modules/wishlist/module.yaml`** — the declarative manifest that mirrors/complements this file (module name, dependencies, etc.).
- **`src/modules/account/module.yaml`** — the account module that *calls* this module's `personalData.erase` hook during account deletion; the relationship is event/hook-based, not an import.
- **`src/modules.ts`** — top-level module registry that loads this module at boot.

## Notes

- **Acyclic imports by design.** Cleanup of deleted products is done via a domain event (not an import from `products`), and account erasure is done via the `personalData.erase` hook (not an import from `account`). This keeps the static import graph a DAG.
- **`erase` joins the caller's transaction.** Per the DDD-D6 comment, `wishlistDeleteByUserId` participates in the same hard-delete transaction as the account deletion; it is not a fire-and-forget call.
- **No business rules here.** The module header explicitly states there is nothing worth modelling at this layer — all rules live in `service.ts`.
