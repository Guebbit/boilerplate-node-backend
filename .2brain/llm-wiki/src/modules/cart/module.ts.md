---
source: src/modules/cart/module.ts
sha256: 2414dcea8349d641eabf60104d1311b0bb185d174a3a9dbe086e27b9d72b9da5
generated_at: 2026-10-14T15:09:13.480582+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/module.ts

## Purpose

Module manifest (entry point) for the shopping-cart module. It assembles the cart's HTTP routes, configuration, rate limits, personal-data hooks, and domain-event subscriptions into a single `AppModule` object that the kernel registry consumes at startup.

## Key elements

- **Default export** — the `AppModule` manifest: `name: 'cart'`, `basePath: '/cart'`, `routes` (from `./routes`), `config` (a slice of `cartConfig`), `rateLimits`, `personalData`, `subscribe`, and `locales` path.
- **`personalData.collect`** — fetches the user's cart lines via `cartGet` and strips each to `{ productId, quantity }` only.
- **`personalData.erase`** — delegates to `cartDeleteByUserId` (a hard-delete that joins the caller's transaction).
- **`subscribe`** — registers a `PRODUCT_DELETED` handler that calls `productRemoveFromCartsById(productId, titles)` to purge the deleted product from every cart.

## Relationships

- **`src/kernel/registry.ts`** — the export is typed `satisfies AppModule`; the registry is the consumer of this manifest.
- **`src/kernel/events.ts`** — provides `onDomainEvent`, used inside `subscribe` to listen for cross-module events without a direct module import.
- **`src/modules/products/index.ts`** — source of the `PRODUCT_DELETED` event constant; the cart subscribes to it reactively (no import of product logic).
- **`src/modules/cart/routes.ts`** — supplies the `router` wired into the manifest.
- **`src/modules/cart/config.ts`** — supplies `cartConfig`, sliced before being exposed.
- **`src/modules/cart/rate-limits.ts`** — supplies `cartRateLimits`.
- **`src/modules/cart/services/index.ts`** — re-exports `cartGet`, `cartDeleteByUserId`, and `productRemoveFromCartsById` used by the personal-data hooks and event handler.

## Notes

- **Acyclic import graph by design.** The module doc explicitly states that products and users "reach back" only through domain events or the `personalData.erase` hook — never via direct imports. Do not add a `products` or `users` import here.
- **`collect` strips catalogue data on purpose.** The shared `CartItem` contract is `additionalProperties: false`; including product name/price would violate it. Only `productId` and `quantity` survive.
- **`config` uses `.slice()`** to hand out a shallow copy, preventing downstream mutation of the original array.
